/**
 * NZi Agent Web — Shared Types
 *
 * 前后端共享的类型定义。
 * Backend (Fastify) 和 Frontend (Next.js) 都引用此包。
 *
 * 原则：
 * - 零运行时依赖（纯类型定义）
 * - 不依赖任何框架特定类型
 * - enum 编译为字符串字面量，前后端一致
 */

// ─── Engine Provider ───────────────────────────────────────────────

export enum EngineProvider {
  PI = "PI",
  GROK = "GROK",
}

// ─── Agent Event Type ──────────────────────────────────────────────

export enum AgentEventType {
  AGENT_START = "agent_start",
  AGENT_END = "agent_end",
  TURN_START = "turn_start",
  TURN_END = "turn_end",
  MESSAGE_START = "message_start",
  MESSAGE_UPDATE = "message_update",
  MESSAGE_END = "message_end",
  TOOL_EXECUTION_START = "tool_execution_start",
  TOOL_EXECUTION_UPDATE = "tool_execution_update",
  TOOL_EXECUTION_END = "tool_execution_end",
  COMPACTION_START = "compaction_start",
  COMPACTION_END = "compaction_end",
  ERROR = "error",
}

// ─── Unified Agent Event ──────────────────────────────────────────

export interface NZiAgentEvent {
  /** 事件 ID（由 Adapter 生成） */
  id: string;
  /** 归属会话 ID */
  sessionId: string;
  /** 前端节点 ID（UI 渲染用） */
  nodeId: string;
  /** Agent 提供商 */
  provider: EngineProvider;
  /** 事件类型 */
  eventType: AgentEventType;
  /** 链路追踪 ID（一次 prompt 的所有事件共享） */
  traceId: string;
  /** 父事件 ID（树结构，可选） */
  parentEventId: string | null;
  /** 是否 fork 节点 */
  isFork: boolean;
  /** 是否 Arena 节点 */
  isArena: boolean;
  /** 事件内容（文本 / 推理摘要 / 工具结果） */
  content?: string;
  /** 事件耗时（毫秒） */
  durationMs?: number;
  /** Token 使用量 */
  tokenUsage?: { prompt: number; completion: number; total: number };
  /** 原始 payload（用于调试/审计，可选） */
  eventData?: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
}

// ─── Prompt Options ───────────────────────────────────────────────

export interface PromptContext {
  /** 模型 ID */
  model?: string;
  /** 思维链级别 */
  thinkingLevel?: "off" | "low" | "medium" | "high";
  /** 系统提示词 */
  systemPrompt?: string;
  /** 允许的工具列表 */
  allowedTools?: string[];
}

export interface PromptOptions {
  /** 会话 ID */
  sessionId: string;
  /** 用户消息内容 */
  content: string;
  /** 父事件 ID（fork 分支用） */
  parentEventId?: string | null;
  /** 租户 ID（用于查找 API Key） */
  tenantId: string;
  /** 上下文 */
  context?: PromptContext;
  /**
   * 本次请求的唯一 ID（由 WsChatController 生成）。
   * 用于 Adapter 层注册 session → 支持 stop/abort 时按请求精确定位。
   */
  requestId: string;
}

// ─── Engine Health ────────────────────────────────────────────────

export interface EngineHealth {
  healthy: boolean;
  latencyMs: number;
  detail?: string;
}

// ─── Adapter Interface ────────────────────────────────────────────

export interface IEngineAdapter {
  /** 适配器名称 */
  readonly name: EngineProvider;
  /** 初始化（加载配置、检查依赖） */
  initialize(): Promise<void>;
  /** 引擎是否可用 */
  isAvailable(): Promise<boolean>;
  /** 发送 prompt 并流式返回事件 */
  streamPrompt(options: PromptOptions): AsyncIterable<NZiAgentEvent>;
  /** 取消进行中的请求（可选）。sessionId 为 NZi 会话 ID，requestId 标识具体那次 prompt */
  abort?(sessionId: string, requestId: string): Promise<void>;
  /** 健康检查（可选） */
  healthCheck?(): Promise<EngineHealth>;
}
