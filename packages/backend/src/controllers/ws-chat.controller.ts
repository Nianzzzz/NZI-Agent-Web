/**
 * T004 Phase 2 — WebSocket Chat Controller
 *
 * 职责：
 * - WS 连接鉴权（Sec-WebSocket-Protocol 子协议头传递 JWT）
 * - 单向事件流：客户端只发 chat/stop，服务端只发 status/chunk/done/error/interrupted
 * - 内存拼接流式文本，避免逐 chunk 写库
 * - 支持 AbortController 中断与断线续断（残卷入库）
 *
 * 安全：
 * - 入站消息经 Zod 校验（prompt ≤ 10k 字符，agentType/thinkingLevel 枚举限制）
 * - 每 socket 独立速率计数器（60s 内 ≤ 10 条 chat、≤ 30 条 stop）
 * - maxPayload 由插件层限制为 1 MiB
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
import { routePromptByProvider, abortPrompt } from "../engine/engine-bridge.js";
import { EngineProvider } from "@nzi/shared-types";
import type { TimelineNode } from "../ws/chat.types.js";
import { validateClientMessage } from "../ws/chat.types.js";
import type { ServerMessage } from "../ws/chat.types.js";

interface RequestContext {
  abortController: AbortController;
  /** 累积最终 answer 文本（落库用） */
  texts: string[];
  /** Agent Loop Timeline 节点（按引擎 nodeId 索引） */
  nodes: Map<string, TimelineNode>;
}

/** 每 socket 的速率限制计数器 */
interface SocketRateLimit {
  chatCount: number;
  stopCount: number;
  windowStart: number;
}

/** 速率限制阈值 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CHAT = 10;
const RATE_LIMIT_MAX_STOP = 30;

export class WsChatController {
  constructor(
    private sessionService: SessionService,
    private verify: (token: string) => unknown,
  ) {}

  /**
   * WebSocket 连接处理器
   *
   * 鉴权：通过 Sec-WebSocket-Protocol 子协议头传递 JWT
   * （避免 token 出现在 URL query 中被日志记录）
   * 协议：客户端发送 JSON { type: "chat" | "stop", payload: {...} }
   */
  wsHandler(
    socket: WebSocket,
    request: {
      url: string;
      headers?: Record<string, string | undefined>;
      user?: TokenPayload;
    },
  ) {
    // ─── 1. 鉴权 ─────────────────────────────────────────────────
    // 优先从 Sec-WebSocket-Protocol 头读取 token（安全方式）
    // 回退到 query ?token=（兼容旧客户端）
    const protocol = request.headers?.["sec-websocket-protocol"] ?? "";
    let token = protocol.trim() || "";
    if (!token) {
      const url = new URL(request.url ?? "", "http://localhost");
      token = url.searchParams.get("token") ?? "";
    }

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

    // 每 socket 独立的速率限制状态
    const rateLimit: SocketRateLimit = {
      chatCount: 0,
      stopCount: 0,
      windowStart: Date.now(),
    };

    /** 检查速率限制，超限返回 true */
    const checkRateLimit = (type: "chat" | "stop"): boolean => {
      const now = Date.now();
      if (now - rateLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimit.chatCount = 0;
        rateLimit.stopCount = 0;
        rateLimit.windowStart = now;
      }
      if (type === "chat") {
        rateLimit.chatCount += 1;
        return rateLimit.chatCount > RATE_LIMIT_MAX_CHAT;
      }
      rateLimit.stopCount += 1;
      return rateLimit.stopCount > RATE_LIMIT_MAX_STOP;
    };

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

        // Zod 校验入站消息
        const validated = validateClientMessage(raw);
        if ("error" in validated) {
          this.sendSocket(socket, {
            type: "error",
            payload: { message: validated.error },
          } satisfies ServerMessage);
          return;
        }

        const { type, payload } = validated;

        // 速率限制检查
        if (checkRateLimit(type)) {
          socket.close(4002, "Rate limit exceeded");
          return;
        }

        if (type === "chat") {
          await this.handleChat(
            socket,
            tenantUser,
            payload as {
              sessionId: string;
              agentType?: "PI" | "GROK";
              prompt: string;
              thinkingLevel?: "off" | "low" | "medium" | "high";
            },
            activeRequests,
          );
        } else if (type === "stop") {
          await this.handleStop(
            socket,
            payload as { requestId: string },
            activeRequests,
          );
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
    payload: { sessionId: string; agentType?: "PI" | "GROK"; prompt: string; thinkingLevel?: "off" | "low" | "medium" | "high" },
    activeRequests: Map<
      string,
      RequestContext & { sessionId: string; rootEventId?: string; provider: "PI" | "GROK" }
    >,
  ) {
    const { sessionId, prompt, agentType = "PI", thinkingLevel = "off" } = payload;
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
    const nodes = new Map<string, TimelineNode>();
    const startTime = Date.now();

    activeRequests.set(requestId, {
      abortController,
      texts,
      nodes,
      sessionId,
      rootEventId,
      provider: agentType,
    });

    // ─── 多轮上下文：取最近历史消息（不含刚写入的 USER 提问） ───
    // 供 BailianAdapter 等使用；PiAdapter 自行维护 session 历史，忽略此字段
    const historyMessages = await this._loadHistoryMessages(sessionId, user.tenantId);

    let finalDoneSent = false;

    try {
      const eventIterator = routePromptByProvider(provider, {
        sessionId,
        content: prompt,
        tenantId: user.tenantId ?? "",
        requestId,
        context: {
          thinkingLevel: thinkingLevel as "off" | "low" | "medium" | "high",
        },
        messages: historyMessages,
      } as never);

      for await (const event of eventIterator) {
        // 检查是否被中断
        if (abortController.signal.aborted) {
          break;
        }

        const eventType = event.eventType as string;
        const nodeKind = (event.eventData?.nodeKind as string | undefined) ?? null;

        // ─── T010: 引擎事件 → WS node 事件翻译 ──────────────
        if (eventType === "tool_execution_start" || eventType === "message_start") {
          if (!nodeKind) continue; // agent_start / turn_start 不上 timeline
          const node: TimelineNode = {
            id: event.nodeId,
            type: nodeKind as "thinking" | "tool" | "answer",
            phase: "start",
            title:
              (event.eventData?.title as string | undefined) ??
              this.defaultNodeTitle(nodeKind as "thinking" | "tool" | "answer"),
            status: "running",
            toolInput: event.eventData?.toolInput as Record<string, unknown> | undefined,
            startedAt: event.timestamp,
          };
          nodes.set(event.nodeId, node);
          this.sendSocket(socket, {
            type: "node",
            payload: { requestId, node },
          } satisfies ServerMessage);
          continue;
        }

        if (eventType === "tool_execution_update" || eventType === "message_update") {
          if (!nodeKind) {
            // 兼容旧版：没标记 nodeKind 的 message_update 视作 answer chunk
            if (eventType === "message_update" && event.content) {
              texts.push(event.content);
              this.sendSocket(socket, {
                type: "chunk",
                payload: { requestId, delta: event.content },
              } satisfies ServerMessage);
            }
            continue;
          }
          if (event.content) {
            // 只把 answer 节点的内容计入最终落库文本；thinking/tool 只保留在 nodes 中
            if (nodeKind === "answer") {
              texts.push(event.content);
            }
            const existing = nodes.get(event.nodeId);
            if (existing) {
              existing.delta = (existing.delta ?? "") + event.content;
            }
          }
          this.sendSocket(socket, {
            type: "node",
            payload: {
              requestId,
              node: {
                id: event.nodeId,
                type: nodeKind as "thinking" | "tool" | "answer",
                phase: "delta",
                delta: event.content ?? "",
              },
            },
          } satisfies ServerMessage);
          continue;
        }

        if (eventType === "tool_execution_end" || eventType === "message_end") {
          if (!nodeKind) continue;
          const prior = nodes.get(event.nodeId);
          const node: TimelineNode = {
            id: event.nodeId,
            type: nodeKind as "thinking" | "tool" | "answer",
            phase: "end",
            title: prior?.title,
            status: "done",
            toolInput: prior?.toolInput,
            toolOutput: event.eventData?.toolOutput as string | undefined,
            durationMs: event.durationMs,
            startedAt: prior?.startedAt,
            // 保留 delta（思考/回答的累积文本），让前端可折叠展示
            delta: prior?.delta,
          };
          nodes.set(event.nodeId, node);
          this.sendSocket(socket, {
            type: "node",
            payload: { requestId, node },
          } satisfies ServerMessage);
          continue;
        }

        if (eventType === "error") {
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
          continue;
        }

        if (eventType === "agent_end" || eventType === "turn_end") {
          // 引擎声明本轮结束 — 落库 + 推 done
          if (!finalDoneSent && texts.length > 0) {
            finalDoneSent = true;
            const fullText = texts.join("");
            const finalNodes = Array.from(nodes.values());
            await this.sessionService.createMessage({
              sessionId,
              role: "ASSISTANT",
              content: fullText,
              rootEventId: rootEventId ?? undefined,
              status: "COMPLETED",
              latencyMs: Date.now() - startTime,
              timelineNodes: finalNodes,
            });
            this.sendSocket(socket, {
              type: "done",
              payload: {
                requestId,
                content: fullText,
                latencyMs: Date.now() - startTime,
                nodes: finalNodes,
              },
            } satisfies ServerMessage);
          }
        }
      }

      if (!finalDoneSent && texts.length > 0) {
        const fullText = texts.join("");
        const finalNodes = Array.from(nodes.values());
        await this.sessionService.createMessage({
          sessionId,
          role: "ASSISTANT",
          content: fullText,
          rootEventId: rootEventId ?? undefined,
          status: "COMPLETED",
          latencyMs: Date.now() - startTime,
          timelineNodes: finalNodes,
        });
        this.sendSocket(socket, {
          type: "done",
          payload: {
            requestId,
            content: fullText,
            latencyMs: Date.now() - startTime,
            nodes: finalNodes,
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

    // 通知 Adapter 层停止底层引擎的流式生成（Pi Agent session.abort()）。
    // 即使 abortPrompt 失败，上层仍会走中断落库路径。
    await abortPrompt(ctx.provider, ctx.sessionId, payload.requestId);

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

  /** Timeline 节点默认标题 */
  private defaultNodeTitle(kind: "thinking" | "tool" | "answer"): string {
    if (kind === "thinking") return "思考中…";
    if (kind === "tool") return "调用工具";
    return "回答";
  }

  /**
   * 加载会话历史消息（最近 20 条，按时间正序），转换为 ChatCompletionMessage 格式。
   * 供 BailianAdapter 等多轮上下文适配器使用。
   *
   * 注意：调用方（handleChat）在调用此方法之前已经写入了当前 USER 消息，
   * 所以历史里不包含当前轮的用户提问（当前提问由 Adapter 追加）。
   */
  private async _loadHistoryMessages(
    sessionId: string,
    tenantId: string,
  ): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> {
    try {
      const raw = await this.sessionService.getMessages(sessionId, tenantId, 20);
      return raw
        .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
        .map((m) => ({
          role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        }));
    } catch {
      // 历史加载失败不阻断当前对话
      return [];
    }
  }
}
