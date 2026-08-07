/**
 * T004 Phase 2 — WebSocket 消息协议定义
 *
 * 客户端与后端通过以下 JSON 协议通信：
 * - chat：发起对话 / 继续生成
 * - stop：主动停止生成
 */

/** 客户端 -> 服务端的消息类型 */
export type ClientMessageType = "chat" | "stop";

/** 客户端 -> 服务端：发起对话 */
export interface ChatMessagePayload {
  sessionId: string;
  /** 引擎类型，默认 "PI" */
  agentType?: "PI" | "GROK";
  prompt: string;
}

/** 客户端 -> 服务端：停止生成 */
export interface StopMessagePayload {
  /** 要停止的请求 ID（对应 serviceRequestId） */
  requestId: string;
}

export interface ClientMessage {
  type: ClientMessageType;
  payload: ChatMessagePayload | StopMessagePayload;
}

/** 服务端 -> 客户端的消息类型 */
export type ServerMessageType =
  | "status"
  | "chunk"
  | "done"
  | "error"
  | "interrupted";

/** 服务端 -> 客户端：状态更新 */
export interface ServerStatusPayload {
  /** 当前请求的上下文 ID */
  requestId?: string;
  /** 引擎类型 PI / GROK */
  agentType?: "PI" | "GROK";
  /** 状态描述 */
  text?: string;
}

/** 服务端 -> 客户端：文本分片 */
export interface ServerChunkPayload {
  /** 当前请求的上下文 ID */
  requestId?: string;
  /** 本次额外追加的文本（不是完整内容） */
  delta: string;
  /** 是否包含思维过程 */
  reasoning?: boolean;
}

/** 服务端 -> 客户端：生成完成 */
export interface ServerDonePayload {
  /** 当前请求的上下文 ID */
  requestId?: string;
  /** 完整生成的最终文本 */
  content: string;
  /** Token 消耗 */
  tokenUsage?: { prompt: number; completion: number; total: number };
  /** 耗时（毫秒） */
  latencyMs?: number;
}

/** 服务端 -> 客户端：生成出错 */
export interface ServerErrorPayload {
  /** 当前请求的上下文 ID */
  requestId?: string;
  /** 错误描述（面向用户） */
  message: string;
}

/** 服务端 -> 客户端：生成被中断 */
export interface ServerInterruptedPayload {
  /** 当前请求的上下文 ID */
  requestId?: string;
  /** 到目前为止生成的内容 */
  content: string;
  /** 中断原因 */
  reason: "user_stop" | "disconnect";
}

export interface ServerMessage {
  type: ServerMessageType;
  payload: ServerStatusPayload | ServerChunkPayload | ServerDonePayload | ServerErrorPayload | ServerInterruptedPayload;
}
