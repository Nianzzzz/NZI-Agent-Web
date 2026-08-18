/**
 * Bailian (阿里云百炼) Engine Adapter
 *
 * 用途：通过 OpenAI 兼容接口接入阿里云百炼平台的模型（如 qwen-turbo、qwen-plus、qwen-max 等）。
 *
 * 百炼平台提供 OpenAI-compatible API（/v1/chat/completions），因此直接复用 @anthropic-ai/sdk
 * 的 OpenAI 兼容模式（Anthropic SDK 7.x 同时支持 Anthropic Messages API 和 OpenAI Responses API）。
 *
 * 环境变量（均在 packages/backend/.env 中配置）：
 *   BAILIAN_API_KEY    必填 — 百炼 API Key（sk-xxx）
 *   BAILIAN_BASE_URL   选填 — 百炼 OpenAI 兼容端点，默认 https://dashscope.aliyuncs.com/compatible-mode/v1
 *   BAILIAN_MODEL      选填 — 模型 ID，默认 qwen-plus
 *
 * 多轮上下文：Controller 通过 PromptOptions.messages 传入历史消息，
 * BailianAdapter 将其拼入 messages 数组一并发送。
 */

import type { IEngineAdapter, NZiAgentEvent, PromptOptions, ChatCompletionMessage } from "@nzi/shared-types";
import { AgentEventType, EngineProvider } from "@nzi/shared-types";
import OpenAI from "openai";
import { getToolDefinitions, executeTool } from "../../tools/registry.js";
import type { ToolResult } from "../../tools/registry.js";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";
const MAX_HISTORY_MESSAGES = 20; // 最多携带的历史消息条数（保留最近 N 条）
const STREAM_TIMEOUT_MS = 120_000;
const TOOL_MAX_ITERATIONS = 10; // 工具调用最大循环次数（防死循环）

/**
 * BailianAdapter — 阿里云百炼 OpenAI 兼容适配器
 *
 * 事件流（与 Mock/Pi 保持一致）：
 *   AGENT_START → MESSAGE_START(thinking) → [THINKING deltas] → MESSAGE_END(thinking)
 *   → MESSAGE_START(answer) → [ANSWER deltas] → MESSAGE_END(answer) → AGENT_END
 */
export class BailianAdapter implements IEngineAdapter {
  readonly name: EngineProvider.PI = EngineProvider.PI;

  private _client: OpenAI | null = null;

  // ─── IEngineAdapter 实现 ────────────────────────────────────────

  async initialize(): Promise<void> {
    const apiKey = process.env.BAILIAN_API_KEY;
    if (!apiKey) {
      throw new Error("BAILIAN_API_KEY not set — BailianAdapter unavailable");
    }
    const baseURL = process.env.BAILIAN_BASE_URL ?? DEFAULT_BASE_URL;
    this._client = new OpenAI({
      apiKey,
      baseURL,
      // 百炼兼容 OpenAI chat/completions 接口
      dangerouslyAllowBrowser: true,
    });
  }

  async isAvailable(): Promise<boolean> {
    if (this._client) return true;
    return !!process.env.BAILIAN_API_KEY;
  }

  async *streamPrompt(options: PromptOptions): AsyncIterable<NZiAgentEvent> {
    if (!this._client) {
      yield this._errorEvent(options, new Error("BailianAdapter not initialized — set BAILIAN_API_KEY in .env"));
      return;
    }

    const traceId = crypto.randomUUID();
    const agentNodeId = `bailian_${crypto.randomUUID()}`;
    const startTime = Date.now();
    const model = process.env.BAILIAN_MODEL ?? DEFAULT_MODEL;
    const workingDirectory = options.context?.workingDirectory ?? process.cwd();

    // ─── AGENT_START ───────────────────────────────────────────
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: agentNodeId,
      provider: EngineProvider.PI,
      eventType: AgentEventType.AGENT_START,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "Bailian engine started",
      timestamp: startTime,
    };

    // ─── 组装 messages（历史 + 当前用户提问） ──────────────────
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      this._buildMessagesWithTools(options);

    // 工具定义（仅当 allowedTools 未明确禁用时注入）
    const toolDefs = getToolDefinitions();
    const toolsEnabled = !options.context?.allowedTools || options.context.allowedTools.length > 0;

    let tokenUsage: { prompt: number; completion: number; total: number } | undefined;
    let iteration = 0;

    // ─── 工具调用循环 ──────────────────────────────────────────
    while (iteration < TOOL_MAX_ITERATIONS) {
      iteration++;

      // ─── 流式调用百炼 ────────────────────────────────────────
      let stream;
      try {
        stream = await this._client.chat.completions.create({
          model,
          messages,
          stream: true,
          stream_options: { include_usage: true },
          tools: toolsEnabled ? (toolDefs as never) : undefined,
          // thinking level 映射：off → 不启用推理，其他 → 启用 reasoning
          ...(options.context?.thinkingLevel && options.context.thinkingLevel !== "off"
            ? { extra_body: { enable_thinking: true } }
            : {}),
        }, { timeout: STREAM_TIMEOUT_MS } as never);
      } catch (err) {
        yield this._errorEvent(options, err);
        return;
      }

      const thinkingNodeId = `bailian_thinking_${iteration}_${crypto.randomUUID()}`;
      const answerNodeId = `bailian_answer_${iteration}_${crypto.randomUUID()}`;
      let hasThinking = false;
      let thinkingStarted = false;
      let answerStarted = false;

      // 累积本轮内容
      let answerContent = "";
      const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
      let currentToolCall: { index: number; id: string; type: string; function: { name: string; arguments: string } } | null = null;
      let finishReason: string | null = null;

      try {
        for await (const chunk of stream) {
          // 收集 usage
          if ((chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }).usage) {
            const u = (chunk as { usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }).usage;
            tokenUsage = { prompt: u.prompt_tokens, completion: u.completion_tokens, total: u.total_tokens };
          }

          const choices = ((chunk as unknown) as { choices?: Array<{ delta?: Record<string, unknown>; finish_reason?: string; tool_calls?: Array<Record<string, unknown>> }> }).choices ?? [];
          for (const choice of choices) {
            const delta = choice.delta ?? {};
            finishReason = choice.finish_reason ?? finishReason;

            // 推理内容（thinking）
            if (delta.reasoning_content) {
              if (!thinkingStarted) {
                thinkingStarted = true;
                hasThinking = true;
                yield {
                  id: `evt_${crypto.randomUUID()}`,
                  sessionId: options.sessionId,
                  nodeId: thinkingNodeId,
                  provider: EngineProvider.PI,
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
                provider: EngineProvider.PI,
                eventType: AgentEventType.MESSAGE_UPDATE,
                traceId,
                parentEventId: options.parentEventId ?? null,
                isFork: false,
                isArena: false,
                content: String(delta.reasoning_content),
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
                  provider: EngineProvider.PI,
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
              answerContent += String(delta.content);
              yield {
                id: `evt_${crypto.randomUUID()}`,
                sessionId: options.sessionId,
                nodeId: answerNodeId,
                provider: EngineProvider.PI,
                eventType: AgentEventType.MESSAGE_UPDATE,
                traceId,
                parentEventId: options.parentEventId ?? null,
                isFork: false,
                isArena: false,
                content: String(delta.content),
                timestamp: Date.now(),
                eventData: { nodeKind: "answer" },
              };
            }

            // 工具调用（streaming 累积）
            const toolCallDeltas = (delta as { tool_calls?: Array<Record<string, unknown>> }).tool_calls;
            if (toolCallDeltas) {
              for (const tcDelta of toolCallDeltas) {
                const idx = tcDelta.index as number;
                const fn = (tcDelta.function ?? {}) as { name?: string; arguments?: string };
                if (currentToolCall === null || currentToolCall.index !== idx) {
                  // 新工具调用开始
                  currentToolCall = {
                    index: idx,
                    id: (tcDelta.id as string) ?? "",
                    type: (tcDelta.type as string) ?? "function",
                    function: {
                      name: fn.name ?? "",
                      arguments: fn.arguments ?? "",
                    },
                  };
                } else {
                  // 继续累积参数
                  currentToolCall.function.arguments += fn.arguments ?? "";
                }
              }
            }
          }
        }
      } catch (err) {
        yield this._errorEvent(options, err);
        return;
      }

      // 将累积的工具调用固化
      if (currentToolCall) {
        const existing = toolCalls.find((tc) => tc.id === currentToolCall!.id);
        if (!existing) {
          toolCalls.push({
            id: currentToolCall.id,
            type: currentToolCall.type as "function",
            function: {
              name: currentToolCall.function.name,
              arguments: currentToolCall.function.arguments,
            },
          });
        }
      }

      // ─── THINKING_END ──────────────────────────────────────
      if (hasThinking) {
        yield {
          id: `evt_${crypto.randomUUID()}`,
          sessionId: options.sessionId,
          nodeId: thinkingNodeId,
          provider: EngineProvider.PI,
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

      // ─── 如果有工具调用 → 执行并继续循环 ──────────────────
      if (toolCalls.length > 0) {
        // 把 assistant 的 tool_calls 加入 messages
        messages.push({
          role: "assistant",
          content: answerContent || null,
          tool_calls: toolCalls,
        } as never);

        // 执行每个工具，推送 tool 事件
        for (const tc of toolCalls) {
          const tcFn = (tc as { function: { name: string; arguments: string } }).function;
          const toolNodeId = `bailian_tool_${(tc as { id: string }).id}`;
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(tcFn.arguments || "{}");
          } catch { /* ignore */ }

          // tool_execution_start
          yield {
            id: `evt_${crypto.randomUUID()}`,
            sessionId: options.sessionId,
            nodeId: toolNodeId,
            provider: EngineProvider.PI,
            eventType: AgentEventType.TOOL_EXECUTION_START,
            traceId,
            parentEventId: options.parentEventId ?? null,
            isFork: false,
            isArena: false,
            content: tcFn.name,
            timestamp: Date.now(),
            eventData: {
              nodeKind: "tool",
              title: tcFn.name,
              toolInput: toolArgs,
            },
          };

          // 执行工具
          const result: ToolResult = await executeTool(tcFn.name, toolArgs, { workingDirectory });

          // 逐步推送工具输出（模拟 delta）
          const outputChunks = chunkString(result.output || result.error || "(无输出)", 200);
          for (const chunk of outputChunks) {
            yield {
              id: `evt_${crypto.randomUUID()}`,
              sessionId: options.sessionId,
              nodeId: toolNodeId,
              provider: EngineProvider.PI,
              eventType: AgentEventType.TOOL_EXECUTION_UPDATE,
              traceId,
              parentEventId: options.parentEventId ?? null,
              isFork: false,
              isArena: false,
              content: chunk,
              timestamp: Date.now(),
              eventData: { nodeKind: "tool" },
            };
          }

          // tool_execution_end
          yield {
            id: `evt_${crypto.randomUUID()}`,
            sessionId: options.sessionId,
            nodeId: toolNodeId,
            provider: EngineProvider.PI,
            eventType: AgentEventType.TOOL_EXECUTION_END,
            traceId,
            parentEventId: options.parentEventId ?? null,
            isFork: false,
            isArena: false,
            content: undefined,
            durationMs: 0,
            timestamp: Date.now(),
            eventData: {
              nodeKind: "tool",
              toolOutput: result.output || result.error,
            },
          };

          // 把工具结果加入 messages
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result.output || result.error || "(无输出)",
          } as never);
        }

        // 继续循环，让模型基于工具结果继续生成
        // 清空 answerContent 避免重复推送（工具调用的中间文本不计入最终回答）
        answerContent = "";
        continue;
      }

      // ─── 无工具调用 → 推送 ANSWER_END + AGENT_END，结束 ──
      if (answerStarted) {
        yield {
          id: `evt_${crypto.randomUUID()}`,
          sessionId: options.sessionId,
          nodeId: answerNodeId,
          provider: EngineProvider.PI,
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
      }

      // ─── AGENT_END ─────────────────────────────────────────
      yield {
        id: `evt_${crypto.randomUUID()}`,
        sessionId: options.sessionId,
        nodeId: agentNodeId,
        provider: EngineProvider.PI,
        eventType: AgentEventType.AGENT_END,
        traceId,
        parentEventId: options.parentEventId ?? null,
        isFork: false,
        isArena: false,
        content: "Bailian engine finished",
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      };

      return;
    }

    // 达到最大迭代次数
    yield this._errorEvent(options, new Error(`工具调用超过最大迭代次数（${TOOL_MAX_ITERATIONS}）`));
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; detail?: string }> {
    const start = Date.now();
    if (!process.env.BAILIAN_API_KEY) {
      return { healthy: false, latencyMs: Date.now() - start, detail: "BAILIAN_API_KEY not configured" };
    }
    return { healthy: true, latencyMs: Date.now() - start, detail: "BailianAdapter ready (with tool calling)" };
  }

  // ─── 内部方法 ──────────────────────────────────────────────────

  /**
   * 组装 messages 数组（含工具调用历史）
   */
  private _buildMessagesWithTools(options: PromptOptions): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // system prompt
    if (options.context?.systemPrompt) {
      messages.push({ role: "system", content: options.context.systemPrompt });
    }

    // 历史消息（Controller 传入）
    const history = options.messages ?? [];
    const sliced = history.length > MAX_HISTORY_MESSAGES
      ? history.slice(-MAX_HISTORY_MESSAGES)
      : history;

    for (const m of sliced) {
      if (m.role === "system") {
        messages.push({ role: "system", content: m.content });
      } else if (m.role === "user") {
        messages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        messages.push({ role: "assistant", content: m.content });
      }
    }

    // 当前用户提问
    messages.push({ role: "user", content: options.content });

    return messages;
  }

  private _errorEvent(options: PromptOptions, err: unknown): NZiAgentEvent {
    let message = err instanceof Error ? err.message : String(err);
    // 分类常见 API 错误，给用户友好提示
    if (message.includes("403") || message.toLowerCase().includes("forbidden")) {
      message = "API 密钥无效或无权访问该模型（403 Forbidden）。请检查 BAILIAN_API_KEY 配置。";
    } else if (message.includes("429") || message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("too many requests")) {
      message = "请求过于频繁，请稍后再试（429 Rate Limit）。";
    } else if (message.toLowerCase().includes("insufficient quota") || message.toLowerCase().includes("balance")) {
      message = "API 账户余额不足或免费额度已用完，请充值后重试。";
    } else if (message.toLowerCase().includes("model not found") || message.toLowerCase().includes("invalid model")) {
      message = `模型不可用。请检查 .env 中的模型配置（BAILIAN_MODEL / GROK_MODEL）。详情: ${message}`;
    }
    return {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: `bailian_error_${Date.now()}`,
      provider: EngineProvider.PI,
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

/** 将长字符串分块（用于逐步推送工具输出） */
function chunkString(str: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : ["(空)"];
}
