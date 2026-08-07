/**
 * Mock Engine Adapter (T009)
 *
 * 用途：当真实 Pi / Grok 引擎未配置或不可用时，作为兜底适配器，
 *      让 WebSocket 端到端联调可以跑通（流式 typewriting 演示）。
 *
 * 设计：
 * - 实现 IEngineAdapter，但用 setTimeout 模拟 chunk 节奏
 * - 不写任何外部依赖
 * - 名字 "MOCK"，但同时占用 PI / GROK provider 标识以保证路由
 *   （通过 initializeAdapters 显式提供 providerLabel）
 *
 * 真实接 Pi/Grok 后，把 initializeAdapters 调用里的 MockEngineAdapter
 * 移除即可平滑切换。
 */

import type { IEngineAdapter, NZiAgentEvent, PromptOptions } from "@nzi/shared-types";
import { AgentEventType, EngineProvider } from "@nzi/shared-types";

const TYPE_SPEED_MS = 22; // 每字符延迟，模拟 typewriting

function buildMockReply(prompt: string, provider: "PI" | "GROK"): string {
  const trimmed = prompt.trim();
  const providerLabel = provider === "PI" ? "Pi Agent" : "Grok Agent";

  if (!trimmed) {
    return `_(${providerLabel} · Mock Engine 演示模式)_\n\n` +
      "我还没有收到你的问题。可以试试问我：「用 TypeScript 写一个防抖 hook」或「解释一下 React Server Components」。";
  }

  const lines: string[] = [];
  lines.push(`**🤖 ${providerLabel} · Mock Engine (typewriting demo)**\n`);
  lines.push(`> 收到：\`${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}\`\n`);
  lines.push("---");
  lines.push("### 回复大纲");
  lines.push(`1. 理解需求：${trimmed.split(/\s+/).slice(0, 6).join(" ")}${trimmed.length > 60 ? "…" : ""}`);
  lines.push("2. 设计方案：拆解为输入校验 → 状态管理 → 输出格式化");
  lines.push("3. 落地代码：使用 TypeScript + zod + 状态机");
  lines.push("4. 验证：单元测试 + 端到端联调");
  lines.push("");
  lines.push("### Mock 引擎说明");
  lines.push("- 这是 **Mock Adapter**，用于本地端到端调试流式响应");
  lines.push("- 真实接 Pi/Grok 时，从 `engine-bridge.ts` 的 `initializeAdapters` 移除 mock 即可");
  lines.push("- WebSocket 协议 / 落库 / 中断逻辑与生产路径完全一致");
  lines.push("");
  lines.push("✅ **演示完成** — 这条消息会逐字流入前端，体验与真实引擎一致。");

  return lines.join("\n");
}

export class MockEngineAdapter implements IEngineAdapter {
  readonly name: EngineProvider;

  /** 显式声明此 mock 占用的 provider */
  constructor(provider: EngineProvider = EngineProvider.PI) {
    this.name = provider;
  }

  async initialize(): Promise<void> {
    // Mock 永远可用
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async *streamPrompt(options: PromptOptions): AsyncIterable<NZiAgentEvent> {
    const traceId = crypto.randomUUID();
    const nodeId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    const fullText = buildMockReply(options.content, this.name as "PI" | "GROK");

    // 1. AGENT_START
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId,
      provider: this.name,
      eventType: AgentEventType.AGENT_START,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "Mock engine started",
      timestamp: startTime,
    };

    // 2. MESSAGE_START
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId,
      provider: this.name,
      eventType: AgentEventType.MESSAGE_START,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "",
      timestamp: Date.now(),
    };

    // 3. MESSAGE_UPDATE 逐字流
    const chars = Array.from(fullText);
    for (let i = 0; i < chars.length; i++) {
      // 在每个字符间让出时间循环，模拟 typewriting
      await new Promise<void>((r) => setTimeout(r, TYPE_SPEED_MS));
      yield {
        id: `evt_${crypto.randomUUID()}`,
        sessionId: options.sessionId,
        nodeId,
        provider: this.name,
        eventType: AgentEventType.MESSAGE_UPDATE,
        traceId,
        parentEventId: options.parentEventId ?? null,
        isFork: false,
        isArena: false,
        content: chars[i],
        timestamp: Date.now(),
        eventData: { index: i, total: chars.length },
      };
    }

    // 4. MESSAGE_END
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId,
      provider: this.name,
      eventType: AgentEventType.MESSAGE_END,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: fullText,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
      tokenUsage: {
        prompt: Math.ceil(options.content.length / 4),
        completion: Math.ceil(fullText.length / 4),
        total: Math.ceil((options.content.length + fullText.length) / 4),
      },
    };

    // 5. AGENT_END
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId,
      provider: this.name,
      eventType: AgentEventType.AGENT_END,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "Mock engine finished",
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  async healthCheck() {
    return { healthy: true, latencyMs: 0, detail: "Mock engine ready" };
  }
}
