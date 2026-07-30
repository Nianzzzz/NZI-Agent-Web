import type { IEngineAdapter } from "@nzi/shared-types";

/**
 * T003.1 — Pi Adapter 骨架
 *
 * 当前阶段：接口和依赖注入预留
 *
 * 已知 SDK 契约（已验证）：
 * - createAgentSession(options?) → Promise<{ session, extensionsResult }>
 * - session.prompt(text, options?) → Promise<void>（fire-and-forget）
 * - session.subscribe(listener) → () => void（unsubscribe）
 * - session.agent.messages: AgentMessage[]
 * - session.isStreaming: boolean
 *
 * 凭据注入方式：
 * - 不依赖 Pi Agent 原生 auth 系统
 * - 通过 process.env.XAI_API_KEY 在初始化时注入
 * - NZi Credential Manager（Phase 3）负责加密存储和运行时注入
 */
export class PiAdapter implements IEngineAdapter {
  readonly name: IEngineAdapter["name"] = "PI";

  // TODO T003.1 实现：
  //   initialize(): 确认 SDK 可导入，初始化配置路径
  //   isAvailable(): 检查 Node.js 版本 >= 22.19 + pi-agent 包可解析
  //   streamPrompt(): 创建 session → subscribe → prompt → yield 事件
  //   abort(): 通过 session.agent.abort() 或 AbortSignal 取消
  //   healthCheck(): 返回 { healthy, latencyMs }

  async initialize(): Promise<void> {
    throw new Error("PiAdapter.initialize() not yet implemented");
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async *streamPrompt(
    options: Parameters<IEngineAdapter["streamPrompt"]>[0],
  ): AsyncIterable<import("../../../shared-types/src/engine").NZiAgentEvent> {
    throw new Error("PiAdapter.streamPrompt() not yet implemented");
  }

  async abort(_: string): Promise<void> {
    throw new Error("PiAdapter.abort() not yet implemented");
  }
}
