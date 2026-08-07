import type { IEngineAdapter, NZiAgentEvent } from "@nzi/shared-types";
import { EngineProvider, AgentEventType } from "@nzi/shared-types";

/**
 * T003.1 — Grok Adapter 骨架（Phase 1 占位)
 *
 * Phase 2 实现 ACP stdio 桥接：
 * spawn('grok', ['agent', 'stdio'])
 * → JSON-RPC over stdin/stdout → session/prompt
 * → 解析 AgentMessage → 映射为 NZiAgentEvent
 */
export class GrokAdapter implements IEngineAdapter {
readonly name: EngineProvider = EngineProvider.GROK;

async initialize(): Promise<void> {
// Phase 2: 检查 grok 二进制是否在 PATH
// 初始化 ACP 连接配置
}

async isAvailable(): Promise<boolean> {
// Phase 2: 检查 grok binary + XAI_API_KEY
return false;
}

async *streamPrompt(
options: Parameters<IEngineAdapter["streamPrompt"]>[0],
): AsyncIterable<NZiAgentEvent> {
yield {
id: `grok_stub_${Date.now()}`,
sessionId: options.sessionId,
nodeId: "stub",
provider: EngineProvider.GROK,
eventType: AgentEventType.ERROR,
traceId: crypto.randomUUID(),
parentEventId: options.parentEventId ?? null,
isFork: false,
isArena: false,
content: "Grok Agent 尚未接入（Phase 2 实现）",
timestamp: Date.now(),
};
}
}
