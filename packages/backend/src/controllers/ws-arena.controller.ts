/**
 * T005 — Arena WebSocket Controller
 *
 * 职责：
 * - Arena 对战的 WebSocket 连接处理
 * - 每场对战两个独立 side（A=PI, B=GROK），各自 WS 通道
 * - 协议与 chat WS 一致：客户端只发 stop，服务端推 status/node/chunk/done
 */

import type { WebSocket } from "@fastify/websocket";
import type { TokenPayload } from "../config/auth.config.js";
import { ArenaService } from "../services/arena.service.js";
import { routePromptByProvider, abortPrompt } from "../engine/engine-bridge.js";
import { EngineProvider } from "@nzi/shared-types";
import type { TimelineNode } from "../ws/chat.types.js";
import { validateClientMessage } from "../ws/chat.types.js";
import type { ServerMessage } from "../ws/chat.types.js";
import { SessionService } from "../services/session.service.js";

interface ArenaSideRequestCtx {
  abortController: AbortController;
  texts: string[];
  nodes: Map<string, TimelineNode>;
  sessionId: string;
  provider: EngineProvider;
}

export class WsArenaController {
  constructor(
    private arenaService: ArenaService,
    private sessionService: SessionService,
    private verify: (token: string) => unknown,
  ) {}

  wsHandler(
    socket: WebSocket,
    request: { url: string; headers?: Record<string, string | undefined>; user?: TokenPayload },
  ) {
    // 鉴权
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

    // 从 query 读取 matchId + side
    const url = new URL(request.url ?? "", "http://localhost");
    const matchId = url.searchParams.get("matchId");
    const side = url.searchParams.get("side");
    if (!matchId || (side !== "A" && side !== "B")) {
      socket.close(4003, "Missing matchId or side");
      return;
    }

    // 异步获取 match 并注册 handler
    this.arenaService.getMatch(matchId).then((match) => {
      if (!match || match.tenantId !== user.tenantId) {
        socket.close(4004, "Match not found");
        return;
      }

      const sideInfo = match.sides.find((s) => s.label === side);
      if (!sideInfo) {
        socket.close(4003, "Invalid side");
        return;
      }

      this.attachSocketHandlers(socket, user, matchId, side as "A" | "B", sideInfo);
    }).catch(() => {
      socket.close(4004, "Match not found");
    });
  }

  private attachSocketHandlers(
    socket: WebSocket,
    user: TokenPayload,
    matchId: string,
    side: "A" | "B",
    sideInfo: { provider: EngineProvider; sessionId: string },
  ) {
    const requestId = crypto.randomUUID();
    const abortController = new AbortController();
    const texts: string[] = [];
    const nodes = new Map<string, TimelineNode>();
    const startTime = Date.now();

    this.arenaService.registerRequest(matchId, side, { abortController, texts });

    // 写入用户提问到该 side 的会话
    this.arenaService.getMatch(matchId).then((m) => {
      void this.sessionService.createMessage({
        sessionId: sideInfo.sessionId,
        role: "USER",
        content: m?.prompt ?? "",
        latencyMs: 0,
      });
    });

    this.sendSocket(socket, {
      type: "status",
      payload: { requestId, text: "thinking..." },
    } satisfies ServerMessage);

    // 启动流式生成（不 await，让两个 side 并行）
    void this.runStream(
      socket, matchId, side, sideInfo,
      { abortController, texts, nodes, sessionId: sideInfo.sessionId, provider: sideInfo.provider },
      requestId, startTime, user,
    );

    socket.on("message", async (raw: unknown) => {
      try {
        const rawStr = Buffer.isBuffer(raw) ? raw.toString("utf-8") : typeof raw === "string" ? raw : String(raw);
        const parsed = JSON.parse(rawStr) as { type: string; payload: { requestId?: string } };
        if (parsed.type === "stop") {
          abortController.abort();
          this.arenaService.completeSide(matchId, side);
          this.sendSocket(socket, {
            type: "interrupted",
            payload: { requestId, content: texts.join(""), reason: "user_stop" },
          } satisfies ServerMessage);
        }
      } catch {
        this.sendSocket(socket, {
          type: "error",
          payload: { message: "Invalid message format" },
        } satisfies ServerMessage);
      }
    });

    socket.on("close", () => {
      abortController.abort();
      this.arenaService.completeSide(matchId, side);
    });
  }

  private async runStream(
    socket: WebSocket,
    matchId: string,
    side: "A" | "B",
    sideInfo: { provider: EngineProvider; sessionId: string },
    ctx: ArenaSideRequestCtx,
    requestId: string,
    startTime: number,
    user: TokenPayload,
  ) {
    const match = await this.arenaService.getMatch(matchId);
    if (!match) return;

    const provider = sideInfo.provider;
    const historyMessages = await this._loadHistoryMessages(sideInfo.sessionId, user.tenantId);

    const eventIterator = routePromptByProvider(provider, {
      sessionId: sideInfo.sessionId,
      content: match.prompt,
      tenantId: user.tenantId ?? "",
      requestId,
      context: { thinkingLevel: match.thinkingLevel },
      messages: historyMessages,
    } as never);

    let finalDoneSent = false;

    try {
      for await (const event of eventIterator) {
        if (ctx.abortController.signal.aborted) break;

        const eventType = event.eventType as string;
        const nodeKind = (event.eventData?.nodeKind as string | undefined) ?? null;

        // node start
        if (eventType === "tool_execution_start" || eventType === "message_start") {
          if (!nodeKind) continue;
          const node: TimelineNode = {
            id: event.nodeId,
            type: nodeKind as "thinking" | "tool" | "answer",
            phase: "start",
            title: (event.eventData?.title as string | undefined) ?? this.defaultNodeTitle(nodeKind as "thinking" | "tool" | "answer"),
            status: "running",
            toolInput: event.eventData?.toolInput as Record<string, unknown> | undefined,
            startedAt: event.timestamp,
          };
          ctx.nodes.set(event.nodeId, node);
          this.sendSocket(socket, { type: "node", payload: { requestId, node } } satisfies ServerMessage);
          continue;
        }

        // node delta
        if (eventType === "tool_execution_update" || eventType === "message_update") {
          if (!nodeKind) {
            if (eventType === "message_update" && event.content) {
              ctx.texts.push(event.content);
              this.sendSocket(socket, {
                type: "chunk",
                payload: { requestId, delta: event.content },
              } satisfies ServerMessage);
            }
            continue;
          }
          if (event.content) {
            if (nodeKind === "answer") ctx.texts.push(event.content);
            const existing = ctx.nodes.get(event.nodeId);
            if (existing) existing.delta = (existing.delta ?? "") + event.content;
          }
          this.sendSocket(socket, {
            type: "node",
            payload: { requestId, node: { id: event.nodeId, type: nodeKind as "thinking" | "tool" | "answer", phase: "delta", delta: event.content ?? "" } },
          } satisfies ServerMessage);
          continue;
        }

        // node end
        if (eventType === "tool_execution_end" || eventType === "message_end") {
          if (!nodeKind) continue;
          const prior = ctx.nodes.get(event.nodeId);
          ctx.nodes.set(event.nodeId, {
            id: event.nodeId,
            type: nodeKind as "thinking" | "tool" | "answer",
            phase: "end",
            title: prior?.title,
            status: "done",
            toolInput: prior?.toolInput,
            toolOutput: event.eventData?.toolOutput as string | undefined,
            durationMs: event.durationMs,
            startedAt: prior?.startedAt,
            delta: prior?.delta,
          });
          this.sendSocket(socket, { type: "node", payload: { requestId, node: ctx.nodes.get(event.nodeId)! } } satisfies ServerMessage);
          continue;
        }

        if (eventType === "error") {
          finalDoneSent = true;
          this.sendSocket(socket, {
            type: "error",
            payload: { requestId, message: event.content ?? "Engine error" },
          } satisfies ServerMessage);
          this.arenaService.completeSide(matchId, side);
          break;
        }

        if (eventType === "agent_end" || eventType === "turn_end") {
          if (!finalDoneSent && ctx.texts.length > 0) {
            finalDoneSent = true;
            const fullText = ctx.texts.join("");
            const finalNodes = Array.from(ctx.nodes.values());
            await this.sessionService.createMessage({
              id: requestId,
              sessionId: sideInfo.sessionId,
              role: "ASSISTANT",
              content: fullText,
              status: "COMPLETED",
              latencyMs: Date.now() - startTime,
              timelineNodes: finalNodes,
            });
            this.sendSocket(socket, {
              type: "done",
              payload: { requestId, content: fullText, latencyMs: Date.now() - startTime, nodes: finalNodes },
            } satisfies ServerMessage);
          }
          this.arenaService.completeSide(matchId, side);
        }
      }
    } catch (err) {
      this.sendSocket(socket, {
        type: "error",
        payload: { requestId, message: err instanceof Error ? err.message : "Stream error" },
      } satisfies ServerMessage);
      this.arenaService.completeSide(matchId, side);
    }
  }

  private sendSocket(socket: WebSocket, message: ServerMessage) {
    try { socket.send(JSON.stringify(message)); } catch { /* ignore */ }
  }

  private defaultNodeTitle(kind: "thinking" | "tool" | "answer"): string {
    if (kind === "thinking") return "思考中…";
    if (kind === "tool") return "调用工具";
    return "回答";
  }

  private async _loadHistoryMessages(
    sessionId: string,
    tenantId: string,
  ): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> {
    try {
      const raw = await this.sessionService.getMessages(sessionId, tenantId, 20);
      return raw
        .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
        .map((m) => ({
          role: m.role === "USER" ? "user" as const : "assistant" as const,
          content: m.content,
        }));
    } catch {
      return [];
    }
  }
}
