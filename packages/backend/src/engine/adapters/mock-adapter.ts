/**
 * Mock Engine Adapter (T010 — Agent Loop Timeline)
 *
 * 用途：当真实 Pi / Grok 引擎未配置或不可用时，作为兜底适配器。
 *
 * T010 升级：从单一 MESSAGE 流改为 3 阶段 Loop Timeline：
 *   1. thinking   — Agent 内部推理（灰色块，可折叠）
 *   2. tool call  — 工具调用（黄色卡片，显示工具名 / 参数 / 结果）
 *   3. answer     — 最终回复（绿色文本流）
 *
 * 每阶段以 AGENT_START / TURN_START / TOOL_EXECUTION_* / MESSAGE_* / AGENT_END 事件呈现。
 * EngineBridge 与 ws-chat.controller 负责把这些事件翻译成 WS `node` 事件。
 *
 * 真实接 Pi/Grok 后，把 initializeAdapters 调用里的 MockEngineAdapter
 * 移除即可平滑切换（真实引擎本就发这些事件）。
 */

import type { IEngineAdapter, NZiAgentEvent, PromptOptions } from "@nzi/shared-types";
import { AgentEventType, EngineProvider } from "@nzi/shared-types";

const TYPE_SPEED_MS = 14; // 每字符延迟，模拟 typewriting（比 T009 略快，便于看到节点切换）

// ─── 思考内容生成 ────────────────────────────────────────────────

function buildThinking(prompt: string, provider: "PI" | "GROK"): string {
  const providerLabel = provider === "PI" ? "Pi Agent" : "Grok Agent";
  const trimmed = prompt.trim();
  return `让我分析一下用户的问题。\n\n` +
    `**问题理解**：用户问的是「${trimmed.slice(0, 60)}${trimmed.length > 60 ? "…" : ""}」\n\n` +
    `**思考路径**：\n` +
    `1. 先判断这是个 ${trimmed.length < 20 ? "简短" : "中等长度"} 的查询\n` +
    `2. 关键词提取：${trimmed.split(/\s+/).slice(0, 5).join(" / ")}\n` +
    `3. 我应该给出一个有结构、有例子的回答，而不是泛泛而谈\n` +
    `4. 如果需要查证事实，可以调用搜索工具\n\n` +
    `**决策**：本次回答由 ${providerLabel} 直接生成，不需要外部工具。`;
}

// ─── 工具调用 mock（如果 prompt 含 "搜索" / "search"） ──────────

function shouldUseTool(prompt: string): { toolName: string; input: Record<string, unknown>; output: string } | null {
  const lower = prompt.toLowerCase();
  if (lower.includes("搜索") || lower.includes("search") || lower.includes("查一下")) {
    return {
      toolName: "web_search",
      input: { query: prompt.trim().slice(0, 50), max_results: 3 },
      output: `找到 3 条相关结果（mock）：\n` +
        `1. 「${prompt.trim().slice(0, 30)}」相关条目 A — 摘要 200 字\n` +
        `2. 「${prompt.trim().slice(0, 30)}」相关条目 B — 摘要 150 字\n` +
        `3. 「${prompt.trim().slice(0, 30)}」相关条目 C — 摘要 180 字`,
    };
  }
  if (lower.includes("读") || lower.includes("read") || lower.includes("打开")) {
    return {
      toolName: "file_read",
      input: { path: "./README.md", offset: 0, limit: 100 },
      output: "(mock) 读取到 100 行文件内容，提取关键段落已并入回答。",
    };
  }
  return null;
}

// ─── 最终回答生成 ────────────────────────────────────────────────

function buildMockAnswer(prompt: string, provider: "PI" | "GROK", toolOutput: string | null): string {
  const trimmed = prompt.trim();
  const providerLabel = provider === "PI" ? "Pi Agent" : "Grok Agent";
  const lines: string[] = [];
  lines.push(`**🤖 ${providerLabel} · Mock Engine (typewriting demo)**\n`);
  lines.push(`> 收到：\`${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}\`\n`);
  lines.push("---");
  lines.push("### 回复大纲");
  lines.push(`1. 理解需求：${trimmed.split(/\s+/).slice(0, 6).join(" ")}${trimmed.length > 60 ? "…" : ""}`);
  lines.push("2. 设计方案：拆解为输入校验 → 状态管理 → 输出格式化");
  if (toolOutput) {
    lines.push(`3. 参考资料：${toolOutput.split("\n")[0]}`);
    lines.push("4. 落地代码：使用 TypeScript + zod + 状态机");
    lines.push("5. 验证：单元测试 + 端到端联调");
  } else {
    lines.push("3. 落地代码：使用 TypeScript + zod + 状态机");
    lines.push("4. 验证：单元测试 + 端到端联调");
  }
  lines.push("");
  lines.push("### Mock 引擎说明");
  lines.push("- 这是 **Mock Adapter**，用于本地端到端调试流式响应");
  lines.push("- T010 起：每个回复都包含 **思考 → [工具] → 回答** 三阶段，可在 UI 上看到时间线");
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
    const nodeIdBase = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    // ─── AGENT_START ───────────────────────────────────────────
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: `${nodeIdBase}_agent`,
      provider: this.name,
      eventType: AgentEventType.AGENT_START,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "Mock engine started",
      timestamp: startTime,
    };

    // ─── TURN_START ────────────────────────────────────────────
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: `${nodeIdBase}_turn`,
      provider: this.name,
      eventType: AgentEventType.TURN_START,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "turn started",
      timestamp: Date.now(),
    };

    // ─── 阶段 1: THINKING ─────────────────────────────────────
    const thinkingNodeId = `${nodeIdBase}_thinking`;
    const thinkingText = buildThinking(options.content, this.name as "PI" | "GROK");

    // THINKING start
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: thinkingNodeId,
      provider: this.name,
      eventType: AgentEventType.MESSAGE_START,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "",
      timestamp: Date.now(),
      eventData: { nodeKind: "thinking", title: "思考中…" },
    };

    // THINKING delta（流式字符）
    const thinkingChars = Array.from(thinkingText);
    for (let i = 0; i < thinkingChars.length; i++) {
      await new Promise<void>((r) => setTimeout(r, TYPE_SPEED_MS));
      yield {
        id: `evt_${crypto.randomUUID()}`,
        sessionId: options.sessionId,
        nodeId: thinkingNodeId,
        provider: this.name,
        eventType: AgentEventType.MESSAGE_UPDATE,
        traceId,
        parentEventId: options.parentEventId ?? null,
        isFork: false,
        isArena: false,
        content: thinkingChars[i],
        timestamp: Date.now(),
        eventData: { nodeKind: "thinking" },
      };
    }

    // THINKING end
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: thinkingNodeId,
      provider: this.name,
      eventType: AgentEventType.MESSAGE_END,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: thinkingText,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
      eventData: { nodeKind: "thinking" },
    };

    // ─── 阶段 2: TOOL CALL（条件性） ──────────────────────────
    const tool = shouldUseTool(options.content);
    let toolOutput: string | null = null;
    if (tool) {
      const toolNodeId = `${nodeIdBase}_tool`;
      const toolStart = Date.now();

      // TOOL start
      yield {
        id: `evt_${crypto.randomUUID()}`,
        sessionId: options.sessionId,
        nodeId: toolNodeId,
        provider: this.name,
        eventType: AgentEventType.TOOL_EXECUTION_START,
        traceId,
        parentEventId: options.parentEventId ?? null,
        isFork: false,
        isArena: false,
        content: tool.toolName,
        timestamp: toolStart,
        eventData: {
          nodeKind: "tool",
          title: `调用 ${tool.toolName}`,
          toolName: tool.toolName,
          toolInput: tool.input,
        },
      };

      // 模拟工具执行延迟
      await new Promise<void>((r) => setTimeout(r, 350));

      // TOOL end
      yield {
        id: `evt_${crypto.randomUUID()}`,
        sessionId: options.sessionId,
        nodeId: toolNodeId,
        provider: this.name,
        eventType: AgentEventType.TOOL_EXECUTION_END,
        traceId,
        parentEventId: options.parentEventId ?? null,
        isFork: false,
        isArena: false,
        content: tool.output,
        durationMs: Date.now() - toolStart,
        timestamp: Date.now(),
        eventData: {
          nodeKind: "tool",
          toolName: tool.toolName,
          toolOutput: tool.output,
        },
      };
      toolOutput = tool.output;
    }

    // ─── 阶段 3: ANSWER ───────────────────────────────────────
    const answerNodeId = `${nodeIdBase}_answer`;
    const answerText = buildMockAnswer(options.content, this.name as "PI" | "GROK", toolOutput);

    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: answerNodeId,
      provider: this.name,
      eventType: AgentEventType.MESSAGE_START,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "",
      timestamp: Date.now(),
      eventData: { nodeKind: "answer", title: "回答" },
    };

    const answerChars = Array.from(answerText);
    for (let i = 0; i < answerChars.length; i++) {
      await new Promise<void>((r) => setTimeout(r, TYPE_SPEED_MS));
      yield {
        id: `evt_${crypto.randomUUID()}`,
        sessionId: options.sessionId,
        nodeId: answerNodeId,
        provider: this.name,
        eventType: AgentEventType.MESSAGE_UPDATE,
        traceId,
        parentEventId: options.parentEventId ?? null,
        isFork: false,
        isArena: false,
        content: answerChars[i],
        timestamp: Date.now(),
        eventData: { nodeKind: "answer" },
      };
    }

    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: answerNodeId,
      provider: this.name,
      eventType: AgentEventType.MESSAGE_END,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: answerText,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
      tokenUsage: {
        prompt: Math.ceil(options.content.length / 4),
        completion: Math.ceil(answerText.length / 4),
        total: Math.ceil((options.content.length + answerText.length) / 4),
      },
      eventData: { nodeKind: "answer" },
    };

    // ─── TURN_END / AGENT_END ──────────────────────────────────
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: `${nodeIdBase}_turn`,
      provider: this.name,
      eventType: AgentEventType.TURN_END,
      traceId,
      parentEventId: options.parentEventId ?? null,
      isFork: false,
      isArena: false,
      content: "turn ended",
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
    yield {
      id: `evt_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      nodeId: `${nodeIdBase}_agent`,
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
