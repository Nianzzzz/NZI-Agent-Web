import type { IEngineAdapter, NZiAgentEvent, PromptOptions } from "@nzi/shared-types";
import { AgentEventType, EngineProvider } from "@nzi/shared-types";
import { PiEventNormalizer, type NormalizerContext, type PiNativeEvent } from "../normalizer/pi-event-normalizer.js";

/**
 * T003.1 — Pi Adapter 实现
 *
 * 职责：桥接 Pi Agent SDK → NZi 统一事件流
 *
 * 设计原则：
 * 1. 不修改 Pi Agent 源码
 * 2. 只使用公开 SDK API（createAgentSession, session.prompt, session.subscribe）
 * 3. 凭据通过环境变量注入（不依赖 Pi 原生 auth）
 * 4. 事件转换委托给 PiEventNormalizer（单一职责）
 *
 * SDK 契约（已验证）：
 * - createAgentSession(options?) → Promise<{ session, extensionsResult }>
 * - session.prompt(text) → Promise<void> (fire-and-forget)
 * - session.subscribe(listener) → () => void (unsubscribe)
 * - session.isStreaming: boolean
 * - session.agent.messages: AgentMessage[]
 */

// 动态导入 Pi Agent SDK（避免静态依赖导致打包失败）
async function importPiSDK() {
  try {
    const piAgentRoot = getPiAgentRoot();
    const sdkPath = `${piAgentRoot}/packages/coding-agent/src/core/sdk.ts`;
    const mod = await import(sdkPath);
    return mod;
  } catch (err) {
    throw new Error(
      `Failed to import Pi Agent SDK. Ensure packages/pi-agent exists. Error: ${err instanceof Error ? err.message : err}`,
    );
  }
}

function getPiAgentRoot(): string {
  // 从 packages/backend/src/engine/adapters/ 向上推到 repo root，再进 packages/pi-agent
  const repoRoot = new URL("../../../../../", import.meta.url).pathname.replace(/\/$/, "");
  return `${repoRoot}/packages/pi-agent`;
}

// 超时默认值
const DEFAULT_PROMPT_TIMEOUT_MS = 120_000; // 2 minutes
const DEFAULT_COMPLETION_TIMEOUT_MS = 30_000; // 30s after last event

export class PiAdapter implements IEngineAdapter {
  readonly name: EngineProvider.PI = EngineProvider.PI;

  private _available: boolean | null = null;
  private _sdkModule: Awaited<ReturnType<typeof importPiSDK>> | null = null;
  private _normalizer = new PiEventNormalizer();

  // ─── IEngineAdapter 实现 ────────────────────────────────────────

  async initialize(): Promise<void> {
    // 验证 SDK 可导入
    try {
      this._sdkModule = await importPiSDK();
      if (!this._sdkModule.createAgentSession) {
        throw new Error("createAgentSession not found in Pi Agent SDK");
      }
      this._available = true;
    } catch (err) {
      this._available = false;
      throw err;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this._available === null) {
      try {
        await this.initialize();
      } catch {
        return false;
      }
    }
    return this._available ?? false;
  }

  // ─── 活跃 session 注册表（按 requestId 索引） ────────────────
  //
  // 用于 abort(sessionId, requestId) 时精确定位到对应的 Pi Agent session。
  // key = requestId（由 WsChatController 生成，每次 chat 请求唯一）
  private _activeSessions = new Map<string, { session: unknown; unsubscribe: () => void }>();

  // ─── 多轮 session 注册表（按 NZi sessionId 索引） ─────────────
  //
  // Pi Agent 的 session 对象内部维护对话历史（session.agent.messages）。
  // 复用同一个 session 即可实现多轮上下文，无需手动拼装历史消息。
  // key = NZi sessionId
  private _sessionsByNziSession = new Map<string, { session: unknown; unsubscribe: () => void; thinkingLevel?: string }>();

  async *streamPrompt(
    options: PromptOptions,
  ): AsyncIterable<NZiAgentEvent> {
    const { createAgentSession } = this._sdkModule ?? (await importPiSDK());

    const traceId = crypto.randomUUID();
    const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();
    const { requestId, sessionId } = options;

    // 多轮上下文：复用同一 NZi sessionId 对应的 Pi session。
    // 若 thinkingLevel 发生变化则重建 session（thinking level 在 session 创建时确定）。
    const requestedThinkingLevel = options.context?.thinkingLevel ?? "off";
    const existing = this._sessionsByNziSession.get(sessionId);
    const needNewSession = !existing || existing.thinkingLevel !== requestedThinkingLevel;

    let session: unknown;
    let unsubscribe: () => void;
    let reused = false;

    if (needNewSession) {
      // 清理旧 session（如有）
      if (existing) {
        try { existing.unsubscribe(); } catch { /* already closed */ }
      }
      session = await this.createPiSession(options);
      // 空订阅：只用于在 abort 时能安全 unsubscribe
      unsubscribe = (session as { subscribe?: (fn: (e: unknown) => void) => () => void }).subscribe?.(() => {}) ?? (() => {});
    } else {
      session = existing.session;
      reused = true;
      // 复用旧订阅引用（会被下面的新订阅替换）
      unsubscribe = existing.unsubscribe;
    }

    // 收集事件
    const events: NZiAgentEvent[] = [];
    let agentEnded = false;
    let lastEventTime = Date.now();

    const ctx: NormalizerContext = {
      provider: EngineProvider.PI,
      sessionId,
      nodeId,
      traceId,
      parentEventId: options.parentEventId ?? null,
    };

    // 注册事件监听（收集 + 检测 agent_end）
    const newUnsubscribe = (session as { subscribe: (fn: (e: unknown) => void) => () => void }).subscribe((piEvent: unknown) => {
      lastEventTime = Date.now();
      const nziEvent = this._normalizer.normalize(piEvent as PiNativeEvent, ctx);
      if (nziEvent) {
        events.push(nziEvent);
      }

      if (nziEvent?.eventType === AgentEventType.AGENT_END) {
        agentEnded = true;
      }
    });
    unsubscribe = newUnsubscribe;

    // 注册到活跃表（abort 用）+ 多轮表（session 复用用）
    this._activeSessions.set(requestId, { session, unsubscribe });
    if (needNewSession) {
      this._sessionsByNziSession.set(sessionId, { session, unsubscribe, thinkingLevel: requestedThinkingLevel });
    } else {
      // 更新订阅引用（因为每次 streamPrompt 都会创建新订阅）
      const entry = this._sessionsByNziSession.get(sessionId);
      if (entry) entry.unsubscribe = unsubscribe;
    }

    try {
      // 触发 prompt
      await (session as { prompt: (text: string, opts?: unknown) => Promise<void> }).prompt(options.content, {
        expandPromptTemplates: true,
      });
    } catch (err) {
      // prompt 本身可能失败（如无 API Key）
      yield this._normalizer.createError(ctx, err);
      return;
    }

    // 等待事件完成（agent_end、被 abort 或超时）
    const timeoutMs = DEFAULT_PROMPT_TIMEOUT_MS;
    const pollInterval = 100;

    while (!agentEnded) {
      // abort 被外部调用时，立即终止循环
      if (!this._activeSessions.has(requestId)) {
        break;
      }
      const elapsed = Date.now() - lastEventTime;
      if (elapsed > DEFAULT_COMPLETION_TIMEOUT_MS) {
        // 超过无新事件超时，认为完成
        break;
      }
      if (Date.now() - startTime > timeoutMs) {
        yield this._normalizer.createError(
          ctx,
          new Error(`Prompt timeout after ${timeoutMs}ms`),
        );
        break;
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    // 逐条 yield 事件
    for (const event of events) {
      yield event;
    }
  }

  async abort(sessionId: string, requestId: string): Promise<void> {
    // 按 requestId 找到对应的 Pi Agent session 并调用 session.abort()
    const entry = this._activeSessions.get(requestId);
    if (!entry) {
      // 请求已结束或不存在，幂等忽略
      return;
    }
    try {
      const session = entry.session as { abort?: () => Promise<void> };
      if (typeof session.abort === "function") {
        await session.abort();
      }
    } catch {
      // abort 失败不抛 —— 调用方只关心"已尝试中断"
    } finally {
      // 无论如何都清理活跃注册表条目（但保留多轮 session 以便后续继续对话）
      try { entry.unsubscribe(); } catch { /* already unsubscribed */ }
      this._activeSessions.delete(requestId);
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; detail?: string }> {
    const start = Date.now();
    try {
      const available = await this.isAvailable();
      return {
        healthy: available,
        latencyMs: Date.now() - start,
        detail: available ? "Pi Agent SDK ready" : "Pi Agent SDK not available",
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  // ─── 内部方法 ──────────────────────────────────────────────────

  private async createPiSession(options: PromptOptions) {
    const { createAgentSession } = this._sdkModule ?? (await importPiSDK());

    // 最小化配置：只设 cwd，其他用默认值
    // 不依赖 Pi Agent 原生 auth —— NZi 负责凭据管理
    const result = await createAgentSession({
      cwd: process.cwd(),
      // Phase 1 不用任何工具，保持纯对话
      noTools: "all",
      // 思维链级别：由 NZi 用户在会话中控制（默认 off）
      thinkingLevel: options.context?.thinkingLevel ?? undefined,
    });

    return result.session;
  }
}
