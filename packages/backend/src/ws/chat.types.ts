/**
 * T004 Phase 2 — WebSocket 消息协议定义
 *
 * 客户端与后端通过以下 JSON 协议通信：
 * - chat：发起对话 / 继续生成
 * - stop：主动停止生成
 */

import { z } from "zod";

/** 客户端 -> 服务端的消息类型 */
export type ClientMessageType = "chat" | "stop";

/** 客户端 -> 服务端：发起对话 */
export interface ChatMessagePayload {
  sessionId: string;
  /** 引擎类型，默认 "PI" */
  agentType?: "PI" | "GROK";
  prompt: string;
  /** 思维链级别（默认 "off"） */
  thinkingLevel?: "off" | "low" | "medium" | "high";
  /** 工具执行的工作目录（绝对路径），影响 read_file / run_shell 等工具的 cwd */
  workingDirectory?: string;
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
  | "node"
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

/** 服务端 -> 客户端：文本分片（兼容旧版，deprecated） */
export interface ServerChunkPayload {
  /** 当前请求的上下文 ID */
  requestId?: string;
  /** 本次额外追加的文本（不是完整内容） */
  delta: string;
  /** 是否包含思维过程 */
  reasoning?: boolean;
}

/** 服务端 -> 客户端：Agent Loop Timeline 节点事件 */
export type TimelineNodeType = "thinking" | "tool" | "answer";
export type TimelineNodePhase = "start" | "delta" | "end" | "error";

export interface TimelineNode {
  /** 节点 ID（前端 key） */
  id: string;
  /** 节点类型 */
  type: TimelineNodeType;
  /** 阶段：start 创建节点 / delta 追加内容 / end 节点结束 / error 节点出错 */
  phase: TimelineNodePhase;
  /** 节点标题（如 "调用 web_search"） */
  title?: string;
  /** 增量内容（delta 阶段） */
  delta?: string;
  /** 节点状态：running / done / error（end 阶段） */
  status?: "running" | "done" | "error";
  /** 工具调用参数（tool 节点 start 阶段） */
  toolInput?: Record<string, unknown>;
  /** 工具调用结果摘要（tool 节点 end 阶段） */
  toolOutput?: string;
  /** 节点耗时（end 阶段） */
  durationMs?: number;
  /** 节点起始时间戳（start 阶段） */
  startedAt?: number;
}

export interface ServerNodePayload {
  requestId?: string;
  node: TimelineNode;
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
  /** T010: 完整的 timeline 节点列表，前端用于历史回放（刷新后恢复推理过程） */
  nodes?: TimelineNode[];
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
  payload:
    | ServerStatusPayload
    | ServerChunkPayload
    | ServerNodePayload
    | ServerDonePayload
    | ServerErrorPayload
    | ServerInterruptedPayload;
}

// ─── Zod 校验 Schema ──────────────────────────────────────────────

/** 入站 chat 消息 payload：限制 prompt 长度、枚举值 */
export const ChatPayloadSchema = z.object({
  sessionId: z.string().min(1, "sessionId 不能为空"),
  agentType: z.enum(["PI", "GROK"]).optional().default("PI"),
  prompt: z
    .string()
    .min(1, "prompt 不能为空")
    .max(10_000, "prompt 不能超过 10,000 个字符"),
  thinkingLevel: z
    .enum(["off", "low", "medium", "high"])
    .optional()
    .default("off"),
  workingDirectory: z.string().optional(),
});

/** 入站 stop 消息 payload */
export const StopPayloadSchema = z.object({
  requestId: z.string().min(1, "requestId 不能为空"),
});

/** 完整的入站消息校验 */
export function validateClientMessage(
  raw: unknown,
): { type: "chat"; payload: z.infer<typeof ChatPayloadSchema> }
  | { type: "stop"; payload: z.infer<typeof StopPayloadSchema> }
  | { error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { error: "消息格式不正确" };
  }
  const obj = raw as Record<string, unknown>;
  const type = obj.type;

  if (type === "chat") {
    const result = ChatPayloadSchema.safeParse(obj.payload);
    if (!result.success) {
      return {
        error: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      };
    }
    return { type: "chat", payload: result.data };
  }

  if (type === "stop") {
    const result = StopPayloadSchema.safeParse(obj.payload);
    if (!result.success) {
      return {
        error: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      };
    }
    return { type: "stop", payload: result.data };
  }

  return { error: `未知消息类型: ${String(type)}` };
}
