import type { AgentEventType, EngineProvider, NZiAgentEvent } from "@nzi/shared-types";

/**
 * T003.2 — Pi Event Normalizer 骨架
 *
 * 职责：将 Pi Agent 的 AgentEvent 映射为 NZi 统一的 NZiAgentEvent。
 * 映射规则：
 *
 *  Pi AgentEvent                       NZiAgentEvent
 *  ─────────────────────────────────    ──────────────────────────────
 *  { type: "agent_start", data }  →     eventType: AGENT_START
 *  { type: "message_update",          →     eventType: MESSAGE_UPDATE
 *      data: AssistantMessage }           content: extractText(data.content)
 *                                       eventData: { raw: data }
 *
 * 内容提取优先级：
 *  TextContent → content 字段
 *  ThinkingContent → eventData.thinking (不膨胀 content)
 *  ToolCall → eventData.toolCalls[] (不膨胀 content)
 */
export function normalizePiEvent(
  raw: unknown,
  ctx: {
    provider: EngineProvider;
    sessionId: string;
    nodeId: string;
    traceId: string;
    parentEventId: string | null;
  },
): NZiAgentEvent | null {
  // TODO T003.2: 根据真实 Pi AgentEvent 结构实现
  // 已知 Pi AgentEvent: { type: string, data?: unknown, timestamp?: number }
  // 已知 AssistantMessage.content[]: TextContent | ThinkingContent | ToolCall | ImageContent

  // 临时骨架：确认类型系统可编译
  const base: NZiAgentEvent = {
    id: crypto.randomUUID(),
    sessionId: ctx.sessionId,
    nodeId: ctx.nodeId,
    provider: ctx.provider,
    eventType: AgentEventType.ERROR,
    traceId: ctx.traceId,
    parentEventId: ctx.parentEventId,
    isFork: false,
    isArena: false,
    timestamp: Date.now(),
  };

  return base;
}
