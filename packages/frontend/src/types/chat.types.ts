/**
 * NZi Agent Web — Frontend Chat Protocol Types
 *
 * 对齐后端 WebSocket 消息协议（`packages/backend/src/ws/chat.types.ts`）。
 * 所有前后端通过 WebSocket 传输的消息均使用以下类型。
 */

// ─── 客户端 → 服务端 ────────────────────────────────────────────

export type ClientMessageType = "chat" | "stop";

export interface ChatPayload {
  sessionId: string;
  agentType?: "PI" | "GROK";
  prompt: string;
}

export interface StopPayload {
  requestId: string;
}

export interface ClientMessage {
  type: ClientMessageType;
  payload: ChatPayload | StopPayload;
}

// ─── 服务端 → 客户端 ────────────────────────────────────────────

export type ServerMessageType =
  | "status"
  | "chunk"
  | "node"
  | "done"
  | "error"
  | "interrupted";

export interface StatusPayload {
  requestId: string;
  agentType?: "PI" | "GROK";
  text?: string;
}

export interface ChunkPayload {
  requestId: string;
  delta: string;
  reasoning?: boolean;
}

/** Agent Loop Timeline 节点事件 */
export type TimelineNodeType = "thinking" | "tool" | "answer";
export type TimelineNodePhase = "start" | "delta" | "end" | "error";

export interface TimelineNode {
  id: string;
  type: TimelineNodeType;
  phase: TimelineNodePhase;
  title?: string;
  delta?: string;
  status?: "running" | "done" | "error";
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  durationMs?: number;
  startedAt?: number;
}

export interface NodePayload {
  requestId: string;
  node: TimelineNode;
}

export interface DonePayload {
  requestId: string;
  content: string;
  tokenUsage?: { prompt: number; completion: number; total: number };
  latencyMs?: number;
}

export interface ErrorPayload {
  requestId: string;
  message: string;
}

export interface InterruptedPayload {
  requestId: string;
  content: string;
  reason: "user_stop" | "disconnect";
}

export type ServerMessagePayload =
  | StatusPayload
  | ChunkPayload
  | NodePayload
  | DonePayload
  | ErrorPayload
  | InterruptedPayload;

export interface ServerMessage {
  type: ServerMessageType;
  payload: ServerMessagePayload;
}

// ─── 本地 UI 消息模型（用于前端渲染） ──────────────────────────

export type MessageRole = "user" | "assistant" | "tool_result";

/** ChatMessage 现在携带 timeline 节点列表 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  reasoning?: string;
  status: "streaming" | "completed" | "interrupted" | "error";
  createdAt: Date;
  latencyMs?: number;
  /** Agent Loop Timeline 节点（仅 assistant 消息） */
  nodes?: TimelineNode[];
}

// ─── 连接状态 ────────────────────────────────────────────────────

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";
