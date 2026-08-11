/**
 * Grok Engine Adapter（复用百炼 API，独立模型）
 *
 * 用途：通过阿里云百炼 OpenAI 兼容接口接入，与 Pi 引擎共用相同的 API Key 和端点，
 * 但使用独立的模型（默认 qwen-turbo，可通过 GROK_MODEL 覆盖）。
 *
 * 典型用法：Pi 引擎用 qwen-max（强推理），Grok 引擎用 qwen-turbo（快响应），
 * 两者在 Arena 模式下对比，或在会话中切换。
 *
 * 环境变量（均在 packages/backend/.env 中配置）：
 *   BAILIAN_API_KEY    必填 — 百炼 API Key（sk-xxx，与 Pi 共用）
 *   BAILIAN_BASE_URL   选填 — 百炼 OpenAI 兼容端点，默认 https://dashscope.aliyuncs.com/compatible-mode/v1
 *   GROK_MODEL         选填 — Grok 引擎使用的模型 ID，默认 qwen-turbo
 *
 * 多轮上下文：Controller 通过 PromptOptions.messages 传入历史消息，
 * GrokAdapter 将其拼入 messages 数组一并发送。
 */

import type { IEngineAdapter, NZiAgentEvent, PromptOptions, ChatCompletionMessage } from "@nzi/shared-types";
import { AgentEventType, EngineProvider } from "@nzi/shared-types";
import OpenAI from "openai";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-turbo";
const MAX_HISTORY_MESSAGES = 20;
const STREAM_TIMEOUT_MS = 120_000;

/**
 * GrokAdapter — 百炼 OpenAI 兼容适配器（独立模型，与 BailianAdapter 共用 API Key）
 *
 * 事件流（与 Bailian/Mock 保持一致）：
 *   AGENT_START → MESSAGE_START(thinking) → [THINKING deltas] → MESSAGE_END(thinking)
 *   → MESSAGE_START(answer) → [ANSWER deltas] → MESSAGE_END(answer) → AGENT_END
 */
export class GrokAdapter implements IEngineAdapter {
  readonly name: EngineProvider.GROK = EngineProvider.GROK;

  private _client: OpenAI | null = null;

  // ─── IEngineAdapter 实现 ────────────────────────────────────────

  async initialize(): Promise<void> {
    const apiKey = process.env.BAILIAN_API_KEY;
    if (!apiKey) {
      throw new Error("BAILIAN_API_KEY not set — GrokAdapter unavailable");
    }
    const baseURL = process.env.BAILIAN_BASE_URL ?? DEFAULT_BASE_URL;
    this._client = new OpenAI({
      apiKey,
      baseURL,
      dangerouslyAllowBrowser: true,
    });
  }

  async isAvailable(): Promise<boolean> {
    if (this._client) return true;
    return !!process.env.BAILIAN_API_KEY;
  }

  async *streamPrompt(options: PromptOptions): AsyncIterable<NZiAgentEvent> {
    if (!this._client) {
      yield this._errorEvent(options, new Error("GrokAdapter not initialized — set BAILIAN_API_KEY in .env"));
      return;
    }

    const traceId = crypto.randomUUID();
    const nodeId = `grok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();
    const model = process.env.GROK_MODEL ?? DEFAULT_MODEL;

    // ─── AGENT_START ───────────────────────────────────────────
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: `${nodeId}_agent`,
      provider: EngineProvider.GROK,
      eventType: AgentEventType.AGENT_START,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "Grok engine started",
      timestamp: startTime,
    };

    // ─── 组装 messages（历史 + 当前用户提问） ──────────────────
    const messages = this._buildMessages(options);

    // ─── 流式调用百炼 ──────────────────────────────────────────
    let stream;
    try {
      stream = await this._client.chat.completions.create({
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(options.context?.thinkingLevel && options.context.thinkingLevel !== "off"
          ? { extra_body: { enable_thinking: true } }
          : {}),
      }, { timeout: STREAM_TIMEOUT_MS } as never);
    } catch (err) {
      yield this._errorEvent(options, err);
      return;
    }

    const thinkingNodeId = `${nodeId}_thinking`;
    const answerNodeId = `${nodeId}_answer`;
    let hasThinking = false;
    let thinkingStarted = false;
    let answerStarted = false;
    let lastEventTime = Date.now();
    let tokenUsage: { prompt: number; completion: number; total: number } | undefined;

    try {
      for await (const chunk of stream) {
        lastEventTime = Date.now();

        // 收集 usage
        if ((chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }).usage) {
          const u = (chunk as { usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }).usage;
          tokenUsage = { prompt: u.prompt_tokens, completion: u.completion_tokens, total: u.total_tokens };
        }

        const choices = (chunk as { choices?: Array<{ delta?: { content?: string; reasoning_content?: string; role?: string } }> }).choices ?? [];
        for (const choice of choices) {
          const delta = choice.delta ?? {};

          // 推理内容（thinking）
          if (delta.reasoning_content) {
            if (!thinkingStarted) {
              thinkingStarted = true;
              hasThinking = true;
              yield {
                id: `evt_${crypto.randomUUID()}`,
                sessionId: options.sessionId,
                nodeId: thinkingNodeId,
                provider: EngineProvider.GROK,
                eventType: AgentEventType.MESSAGE_START,
                traceId,
                parentEventId: options.parentEventId ?? null,
                isFork: false,
                isArena: false,
                content: "",
                timestamp: Date.now(),
                eventData: { nodeKind: "thinking", title: "思考中…" },
              };
            }
            yield {
              id: `evt_${crypto.randomUUID()}`,
              sessionId: options.sessionId,
              nodeId: thinkingNodeId,
              provider: EngineProvider.GROK,
              eventType: AgentEventType.MESSAGE_UPDATE,
              traceId,
              parentEventId: options.parentEventId ?? null,
              isFork: false,
              isArena: false,
              content: delta.reasoning_content,
              timestamp: Date.now(),
              eventData: { nodeKind: "thinking" },
            };
          }

          // 回答内容
          if (delta.content) {
            if (!answerStarted) {
              answerStarted = true;
              yield {
                id: `evt_${crypto.randomUUID()}`,
                sessionId: options.sessionId,
                nodeId: answerNodeId,
                provider: EngineProvider.GROK,
                eventType: AgentEventType.MESSAGE_START,
                traceId,
                parentEventId: options.parentEventId ?? null,
                isFork: false,
                isArena: false,
                content: "",
                timestamp: Date.now(),
                eventData: { nodeKind: "answer", title: "回答" },
              };
            }
            yield {
              id: `evt_${crypto.randomUUID()}`,
              sessionId: options.sessionId,
              nodeId: answerNodeId,
              provider: EngineProvider.GROK,
              eventType: AgentEventType.MESSAGE_UPDATE,
              traceId,
              parentEventId: options.parentEventId ?? null,
              isFork: false,
              isArena: false,
              content: delta.content,
              timestamp: Date.now(),
              eventData: { nodeKind: "answer" },
            };
          }
        }
      }
    } catch (err) {
      yield this._errorEvent(options, err);
      return;
    }

    // ─── THINKING_END ──────────────────────────────────────────
    if (hasThinking) {
      yield {
        id: `evt_${crypto.randomUUID()}`,
        sessionId: options.sessionId,
        nodeId: thinkingNodeId,
        provider: EngineProvider.GROK,
        eventType: AgentEventType.MESSAGE_END,
        traceId,
        parentEventId: options.parentEventId ?? null,
        isFork: false,
        isArena: false,
        content: undefined,
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
        eventData: { nodeKind: "thinking" },
      };
    }

    // ─── ANSWER_END ────────────────────────────────────────────
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: answerNodeId,
      provider: EngineProvider.GROK,
      eventType: AgentEventType.MESSAGE_END,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: undefined,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
      tokenUsage,
      eventData: { nodeKind: "answer" },
    };

    // ─── AGENT_END ─────────────────────────────────────────────
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: `${nodeId}_agent`,
      provider: EngineProvider.GROK,
      eventType: AgentEventType.AGENT_END,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "Grok engine finished",
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; detail?: string }> {
    const start = Date.now();
    if (!process.env.BAILIAN_API_KEY) {
      return { healthy: false, latencyMs: Date.now() - start, detail: "BAILIAN_API_KEY not configured" };
    }
    return { healthy: true, latencyMs: Date.now() - start, detail: "GrokAdapter ready (Bailian API)" };
  }

  // ─── 内部方法 ──────────────────────────────────────────────────

  private _buildMessages(options: PromptOptions): ChatCompletionMessage[] {
    const messages: ChatCompletionMessage[] = [];

    if (options.context?.systemPrompt) {
      messages.push({ role: "system", content: options.context.systemPrompt });
    }

    const history = options.messages ?? [];
    const sliced = history.length > MAX_HISTORY_MESSAGES
      ? history.slice(-MAX_HISTORY_MESSAGES)
      : history;

    for (const m of sliced) {
      messages.push(m);
    }

    messages.push({ role: "user", content: options.content });
    return messages;
  }

  private _errorEvent(options: PromptOptions, err: unknown): NZiAgentEvent {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: `grok_error_${Date.now()}`,
      provider: EngineProvider.GROK,
      eventType: AgentEventType.ERROR,
      traceId: crypto.randomUUID(),
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: message,
      eventData: { error: err instanceof Error ? err.stack : String(err) },
      timestamp: Date.now(),
    };
  }
}
