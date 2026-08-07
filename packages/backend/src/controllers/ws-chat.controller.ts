/**
 * T004 Phase 2 — WebSocket Chat Controller
 *
 * 职责：
 * - WS 连接鉴权（Query 参数传递 JWT）
 * - 单向事件流：客户端只发 chat/stop，服务端只发 status/chunk/done/error/interrupted
 * - 内存拼接流式文本，避免逐 chunk 写库
 * - 支持 AbortController 中断与断线续断（残卷入库）
 *
 * 流控策略：
 * - 收到 chat：先写用户提问（USER 消息），启动流式生成
 * - 流式迭代：逐事件推送客户端，内存缓冲 assistant 文本
 * - 仅 DONE / ERROR 时：一次性落库 assistant 消息（COMPLETED）
 * - 中断/断线：落库为 INTERRUPTED
 */

import type { WebSocket } from "@fastify/websocket";
import type { TokenPayload } from "../config/auth.config.js";
import { SessionService } from "../services/session.service.js";
import { routePromptByProvider } from "../engine/engine-bridge.js";
import { EngineProvider } from "@nzi/shared-types";
import type { ClientMessage, ServerMessage } from "../ws/chat.types.js";

interface RequestContext {
  abortController: AbortController;
  texts: string[];
}

export class WsChatController {
  constructor(
    private sessionService: SessionService,
    private verify: (token: string) => unknown,
  ) {}

  /**
   * WebSocket 连接处理器
   *
   * 鉴权：通过 query ?token=<JWT> 传递
   * 协议：客户端发送 JSON { type: "chat" | "stop", payload: {...} }
   */
  wsHandler(
    socket: WebSocket,
    request: {
      url: string;
      user?: TokenPayload;
    },
  ) {
    // ─── 1. 鉴权 ─────────────────────────────────────────────────
    // WS 路由不走全局 onRequest 钩子（避免与 HTTP Authorization 头耦合）
    // 这里直接从 URL query 解析 token 并用构造注入的 verify 验证
    const url = new URL(request.url, "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      socket.close(4001, "Missing token");
      return;
    }

    let user: TokenPayload;
    try {
      user = this.verify(token) as TokenPayload;
    } catch {
      socket.close(4001, "Invalid token");
      return;
    }

    // 鉴权成功后注册消息 / 断线处理
    this.attachSocketHandlers(socket, user);
  }

  /**
   * 注册消息/断线/错误事件处理（鉴权通过后调用）
   */
  private attachSocketHandlers(socket: WebSocket, user: TokenPayload) {
    const activeRequests = new Map<
      string,
      RequestContext & {
        sessionId: string;
        rootEventId?: string;
        provider: "PI" | "GROK";
      }
    >();

    // ─── 3. 消息处理 ─────────────────────────────────────────────
    socket.on("message", async (raw: unknown) => {
      try {
        const tenantUser = user;
        if (!tenantUser) {
          this.sendSocket(socket, {
            type: "error",
            payload: { message: "Unauthorized" },
          } satisfies ServerMessage);
          return;
        }

        const message = JSON.parse(raw as string) as ClientMessage;
        const { type, payload } = message;

        if (type === "chat") {
          await this.handleChat(
            socket,
            tenantUser,
            payload as {
              sessionId: string;
              agentType?: "PI" | "GROK";
              prompt: string;
            },
            activeRequests,
          );
        } else if (type === "stop") {
          await this.handleStop(
            socket,
            payload as { requestId: string },
            activeRequests,
          );
        } else {
          this.sendSocket(socket, {
            type: "error",
            payload: { message: `Unknown message type: ${type}` },
          } satisfies ServerMessage);
        }
      } catch {
        this.sendSocket(socket, {
          type: "error",
          payload: { message: "Invalid message format" },
        } satisfies ServerMessage);
      }
    });

    // ─── 4. 断线处理（被动断网也落库） ─────────────────────────
    socket.on("close", () => {
      this.handleDisconnect(activeRequests);
    });

    socket.on("error", () => {
      this.handleDisconnect(activeRequests);
    });
  }

  /**
   * 处理 chat 指令：创建用户消息 -> 流式调用 EngineBridge -> 推送事件流
   */
  private async handleChat(
    socket: WebSocket,
    user: TokenPayload,
    payload: { sessionId: string; agentType?: "PI" | "GROK"; prompt: string },
    activeRequests: Map<
      string,
      RequestContext & { sessionId: string; rootEventId?: string; provider: "PI" | "GROK" }
    >,
  ) {
    const { sessionId, prompt, agentType = "PI" } = payload;
    const provider = EngineProvider[agentType as keyof typeof EngineProvider] ?? EngineProvider.PI;

    // 唯一请求 ID，前端 stop 时传入此 ID 中断
    const requestId = crypto.randomUUID();

    // ─── 租户隔离校验：阻止跨租户 IDOR 写入 ──────────────────
    const session = await this.sessionService.getSession(sessionId, user.tenantId);
    if (!session) {
      this.sendSocket(socket, {
        type: "error",
        payload: { requestId, message: "Session not found" },
      } satisfies ServerMessage);
      return;
    }

    // ─── 写库：用户提问（USER 消息） ───────────────────────────
    let rootEventId: string | undefined;
    try {
      await this.sessionService.createMessage({
        sessionId,
        role: "USER",
        content: prompt,
        latencyMs: 0,
      });
    } catch {
      // 落库失败不阻断流
    }

    // ─── 发送 status ────────────────────────────────────────────
    this.sendSocket(socket, {
      type: "status",
      payload: { requestId, agentType: agentType, text: "thinking..." },
    } satisfies ServerMessage);

    // ─── 流式调用引擎 ───────────────────────────────────────────
    const abortController = new AbortController();
    const texts: string[] = [];
    const startTime = Date.now();

    activeRequests.set(requestId, {
      abortController,
      texts,
      sessionId,
      rootEventId,
      provider: agentType,
    });

    let finalDoneSent = false;

    try {
      const eventIterator = routePromptByProvider(provider, {
        sessionId,
        content: prompt,
      } as never);

      for await (const event of eventIterator) {
        // 检查是否被中断
        if (abortController.signal.aborted) {
          break;
        }

        const eventType = event.eventType as string;
        switch (eventType) {
          case "message_update": {
            if (event.content) {
              texts.push(event.content);
            }
            this.sendSocket(socket, {
              type: "chunk",
              payload: {
                requestId,
                delta: event.content ?? "",
                reasoning: !!event.eventData?.reasoning,
              },
            } satisfies ServerMessage);
            break;
          }
          case "error": {
            finalDoneSent = true;
            await this.persistInterruptedMessage({
              texts,
              sessionId,
              rootEventId,
              suffix: "[生成出错]",
              status: "INTERRUPTED",
            });
            this.sendSocket(socket, {
              type: "error",
              payload: { requestId, message: event.content ?? "Engine error" },
            } satisfies ServerMessage);
            break;
          }
          case "message_end":
          case "agent_end": {
            const fullText = texts.join("");
            if (fullText) {
              await this.sessionService.createMessage({
                sessionId,
                role: "ASSISTANT",
                content: fullText,
                rootEventId: rootEventId ?? undefined,
                status: "COMPLETED",
                latencyMs: Date.now() - startTime,
              });
            }
            this.sendSocket(socket, {
              type: "done",
              payload: {
                requestId,
                content: fullText,
                latencyMs: Date.now() - startTime,
              },
            } satisfies ServerMessage);
            finalDoneSent = true;
            break;
          }
          default:
            break;
        }
      }

      if (!finalDoneSent && texts.length > 0) {
        await this.sessionService.createMessage({
          sessionId,
          role: "ASSISTANT",
          content: texts.join(""),
          rootEventId: rootEventId ?? undefined,
          status: "COMPLETED",
          latencyMs: Date.now() - startTime,
        });
        this.sendSocket(socket, {
          type: "done",
          payload: {
            requestId,
            content: texts.join(""),
            latencyMs: Date.now() - startTime,
          },
        } satisfies ServerMessage);
      }
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Stream error";

      this.sendSocket(socket, {
        type: "error",
        payload: { requestId, message: messageText },
      } satisfies ServerMessage);

      if (texts.length > 0) {
        await this.sessionService.createMessage({
          sessionId,
          role: "ASSISTANT",
          content: texts.join("") + "\n\n[生成异常中断]",
          rootEventId: rootEventId ?? undefined,
          status: "INTERRUPTED",
        });
      }
    } finally {
      activeRequests.delete(requestId);
    }
  }

  /**
   * 处理 stop 指令：中断当前 activeRequests 中的对应请求
   */
  private async handleStop(
    socket: WebSocket,
    payload: { requestId: string },
    activeRequests: Map<
      string,
      RequestContext & { sessionId: string; rootEventId?: string; provider: "PI" | "GROK" }
    >,
  ) {
    const ctx = activeRequests.get(payload.requestId);
    if (!ctx) {
      this.sendSocket(socket, {
        type: "error",
        payload: { message: "Request not found" },
      } satisfies ServerMessage);
      return;
    }

    ctx.abortController.abort();
    const partialText = ctx.texts.join("");

    this.sendSocket(socket, {
      type: "interrupted",
      payload: {
        requestId: payload.requestId,
        content: partialText,
        reason: "user_stop",
      },
    } satisfies ServerMessage);

    if (partialText) {
      await this.persistInterruptedMessage({
        texts: [partialText],
        sessionId: ctx.sessionId,
        rootEventId: ctx.rootEventId,
        suffix: "[生成已停止]",
        status: "INTERRUPTED",
      });
    }

    activeRequests.delete(payload.requestId);
  }

  /**
   * 被动断线：对还在活跃的请求执行剩余落库
   */
  private handleDisconnect(
    activeRequests: Map<
      string,
      RequestContext & { sessionId: string; rootEventId?: string; provider: "PI" | "GROK" }
    >,
  ) {
    for (const [requestId, ctx] of activeRequests) {
      if (!ctx.abortController.signal.aborted) {
        ctx.abortController.abort();
      }
      const text = ctx.texts.join("");
      if (text) {
        void this.persistInterruptedMessage({
          texts: [text],
          sessionId: ctx.sessionId,
          rootEventId: ctx.rootEventId,
          suffix: "[生成已中断]",
          status: "INTERRUPTED",
        });
      }
    }
    activeRequests.clear();
  }

  private async persistInterruptedMessage(args: {
    texts: string[];
    sessionId: string;
    rootEventId?: string;
    suffix: string;
    status: "INTERRUPTED";
  }) {
    const content = args.texts.join("") + "\n\n" + args.suffix;
    if (!content.trim()) return;
    try {
      await this.sessionService.createMessage({
        sessionId: args.sessionId,
        role: "ASSISTANT",
        content,
        rootEventId: args.rootEventId,
        status: args.status,
      });
    } catch {
      // 静默忽略
    }
  }

  private sendSocket(socket: WebSocket, message: ServerMessage) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // 对方已断开
    }
  }
}
