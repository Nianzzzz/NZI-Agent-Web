import {
  AgentEventType,
  EngineProvider,
  NZiAgentEvent,
} from "@nzi/shared-types";

/**
 * T003.2 — Event Normalizer 基接口与 Pi 实现
 *
 * 职责：将各 Agent 的原生事件流（Pi AgentEvent、Grok AgentMessage 等）
 * 统一转换为 NZi 标准 NZiAgentEvent 格式。
 *
 * 设计原则：
 * - 单一职责：只做「类型转换 + 内容提取」，不涉及 SDK 调用或网络
 * - 可替换：不同的 Agent 引擎提供不同的 Normalizer 实现
 * - 可组合：Engine Bridge 根据 provider 选取对应的 Adapter + Normalizer 对
 */

// ─── 基接口 ──────────────────────────────────────────────────────

/**
 * 事件标准化的上下文信息。
 * 每次 streamPrompt 调用时由 Adapter 生成并传入。
 */
export interface NormalizerContext {
  /** Agent 提供商标识 */
  provider: EngineProvider;
  /** 归属会话 ID */
  sessionId: string;
  /** 前端节点 ID（UI 渲染用） */
  nodeId: string;
  /** 链路追踪 ID（一次 prompt 的所有事件共享） */
  traceId: string;
  /** 父事件 ID（fork 分支用，可选） */
  parentEventId: string | null;
}

/**
 * IEventNormalizer — 所有 Agent 事件标准化器的基接口。
 *
 * 未来 Grok Normalizer 只需实现此接口：
 *   class GrokEventNormalizer implements IEventNormalizer { ... }
 *
 * @template T 原生事件的入站类型（Pi = AgentEvent, Grok = AgentMessage）
 */
export interface IEventNormalizer<T = unknown> {
  /**
   * 将单个原生事件转换为 NZiAgentEvent。
   * 返回 null 表示该事件类型不处理（由 Adapter 决定是否跳过）。
   */
  normalize(raw: T, ctx: NormalizerContext): NZiAgentEvent | null;
}

// ─── Pi Event Normalizer ─────────────────────────────────────────

/**
 * Pi Agent 原生事件结构（从 Pi Agent SDK 事件流确认）:
 *   { type: string, data?: { message?: AssistantMessage, ... }, timestamp?: number }
 *
 * AssistantMessage.content[]: TextContent | ThinkingContent | ToolCall | ImageContent
 */

/** Pi Agent 事件中的 message 对象结构 */
interface PiMessage {
  content?: Array<{
    type: string;
    text?: string;
    thinking?: string;
    toolCall?: unknown;
  }>;
  usage?: { prompt: number; completion: number; total: number };
}

/** Pi Agent 原生事件结构 */
export interface PiNativeEvent {
  type: string;
  data?: {
    message?: PiMessage;
    errorMessage?: string;
    error?: unknown;
    toolName?: string;
    toolCallId?: string;
    [key: string]: unknown;
  };
  timestamp?: number;
}

/**
 * PI → NZi 事件类型映射表。
 * 未列出的 Pi event type 会被正常器跳过（返回 null）。
 */
const PI_EVENT_TYPE_MAP: Record<string, AgentEventType> = {
  agent_start: AgentEventType.AGENT_START,
  agent_end: AgentEventType.AGENT_END,
  turn_start: AgentEventType.TURN_START,
  turn_end: AgentEventType.TURN_END,
  message_start: AgentEventType.MESSAGE_START,
  message_update: AgentEventType.MESSAGE_UPDATE,
  message_end: AgentEventType.MESSAGE_END,
  compaction_start: AgentEventType.COMPACTION_START,
  compaction_end: AgentEventType.COMPACTION_END,
};

/**
 * PiEventNormalizer — Pi Agent 事件标准化器。
 *
 * 内容提取优先级：
 * 1. TextContent → event.content（不膨胀 eventData）
 * 2. ThinkingContent → eventData.reasoning[]（不膨胀 content）
 * 3. ToolCall → eventData.toolCalls[]（不膨胀 content）
 */
export class PiEventNormalizer implements IEventNormalizer<PiNativeEvent> {
  normalize(raw: PiNativeEvent, ctx: NormalizerContext): NZiAgentEvent | null {
    const eventType = PI_EVENT_TYPE_MAP[raw.type];
    if (!eventType) return null;

    const base: NZiAgentEvent = {
      id: crypto.randomUUID(),
      sessionId: ctx.sessionId,
      nodeId: ctx.nodeId,
      provider: EngineProvider.PI,
      eventType,
      traceId: ctx.traceId,
      parentEventId: ctx.parentEventId,
      isFork: false,
      isArena: false,
      timestamp: raw.timestamp ?? Date.now(),
    };

    this.enrich(base, raw);
    return base;
  }

  // ─── 内部：内容提取与元数据填充 ──────────────────────────────

  private enrich(event: NZiAgentEvent, piEvent: PiNativeEvent): void {
    const { data } = piEvent;

    // 保留原始 payload（用于调试/审计）
    event.eventData = data as Record<string, unknown>;

    switch (event.eventType) {
      case AgentEventType.MESSAGE_UPDATE:
      case AgentEventType.MESSAGE_START:
      case AgentEventType.MESSAGE_END: {
        const message = data?.message as PiMessage | undefined;
        if (!message?.content) break;

        const segments = message.content;

        // 1. TextContent → content（拼接所有文本块）
        const texts = segments
          .filter((s) => s.type === "text" && s.text)
          .map((s) => s.text as string);
        event.content = texts.length > 0 ? texts.join("\n") : undefined;

        // 2. ThinkingContent → eventData.reasoning（不膨胀 content）
        const reasoning = segments
          .filter((s) => s.type === "thinking" && s.thinking)
          .map((s) => s.thinking as string);
        if (reasoning.length > 0) {
          event.eventData = {
            ...event.eventData,
            reasoning,
          };
        }

        // 3. ToolCall → eventData.toolCalls（不膨胀 content）
        const toolCalls = segments
          .filter((s) => s.type === "toolCall")
          .map((s) => s.toolCall);
        if (toolCalls.length > 0) {
          event.eventData = {
            ...event.eventData,
            toolCalls,
          };
        }

        // Token usage
        if (message.usage) {
          event.tokenUsage = message.usage;
        }
        break;
      }

      case AgentEventType.AGENT_START:
      case AgentEventType.TURN_START: {
        event.content = data?.message as string | undefined;
        break;
      }

      case AgentEventType.TOOL_EXECUTION_START:
      case AgentEventType.TOOL_EXECUTION_UPDATE:
      case AgentEventType.TOOL_EXECUTION_END: {
        const toolData = data as
          | { toolName?: string; toolCallId?: string }
          | undefined;
        if (toolData) {
          event.content = `${toolData.toolName ?? "unknown"}(${toolData.toolCallId ?? ""})`;
        }
        break;
      }

      case AgentEventType.ERROR: {
        event.content =
          (data?.errorMessage as string) ??
          (data?.error as string) ??
          "Unknown error";
        break;
      }

      // AGENT_END / TURN_END / COMPACTION_* 无需额外 enrichment
    }
  }

  /**
   * 创建一个错误事件（供 Adapter 在 catch 块中调用）。
   * @internal PiAdapter 专属辅助方法
   */
  createError(
    ctx: NormalizerContext,
    err: unknown,
    eventType: AgentEventType = AgentEventType.ERROR,
  ): NZiAgentEvent {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: crypto.randomUUID(),
      sessionId: ctx.sessionId,
      nodeId: ctx.nodeId,
      provider: EngineProvider.PI,
      eventType,
      traceId: ctx.traceId,
      parentEventId: ctx.parentEventId,
      isFork: false,
      isArena: false,
      content: message,
      eventData: {
        error: err instanceof Error ? err.stack : String(err),
      },
      timestamp: Date.now(),
    };
  }
}

// ─── 流式数据拼接说明 ────────────────────────────────────────────
//
// Pi Agent 的流式事件是「增量推送」的：
//   message_start → MESSAGE_START（空 content）
//   message_update[0] → MESSAGE_UPDATE（第一段文本 "Hel"）
//   message_update[1] → MESSAGE_UPDATE（增量文本 "lo"）
//   ...
//   message_end → MESSAGE_END（cumulative content "Hello world"）
//
// Normalizer 的处理策略：
// - 每个 message_update 事件的 content 字段只包含「该增量块」的文本
// - 完整文本拼接由 Adapter 层在内存中累积（PiAdapter 不存储，
//   由上游 Controller/WebSocket 负责拼接并发送给前端）
// - message_end 时 event.content = 完整累积文本（Pi SDK 在 data.message 中提供
//   已经拼接好的完整 content）
//
// 为什么不把拼接放在 Normalizer 里？
// - Normalizer 是无状态的纯函数，每帧独立
// - 拼接是「跨帧状态管理」，属于 Adapter/Controller 的职责
// - 这样 Grok Normalizer 同样保持无状态，接口一致
