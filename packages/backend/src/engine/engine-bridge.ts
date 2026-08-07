/**
 * T003.3 — Engine Bridge
 *
 * 职责：统一调度入口，将 streamPrompt 调用路由到正确的 Adapter + Normalizer 组合。
 *
 * 设计：
 * - 维护一个 Adapter 注册表（由 initializeAdapters 注册）
 * - 提供 routePrompt(provider, options) → 根据 provider 选取 Adapter，
 *   Adapter 内部自行使用对应的 Normalizer（通过依赖注入）
 * - provideEngine(provider, adapter) — 允许外部注入自定义 adapter（测试/扩展）
 */

import type { IEngineAdapter, PromptOptions, NZiAgentEvent } from "@nzi/shared-types";
import { EngineProvider } from "@nzi/shared-types";
import { PiAdapter } from "./adapters/pi-adapter.js";
import { GrokAdapter } from "./adapters/grok-adapter.js";
import { MockEngineAdapter } from "./adapters/mock-adapter.js";

// ─── 注册表 ───────────────────────────────────────────────────────

const registry = new Map<string, IEngineAdapter>();

/**
 * 注册一个 Adapter（通常由 initializeAdapters 批量调用）
 */
export async function registerAdapter(adapter: IEngineAdapter): Promise<void> {
  if (registry.has(adapter.name)) {
    throw new Error(`Adapter "${adapter.name}" is already registered`);
  }
  await adapter.initialize();
  registry.set(adapter.name, adapter);
}

/**
 * 获取已注册的 Adapter
 */
export function getAdapter(name: string): IEngineAdapter {
  const adapter = registry.get(name);
  if (!adapter) {
    throw new Error(`No adapter registered for provider: ${name}`);
  }
  return adapter;
}

/**
 * 获取所有已注册的 Adapter
 */
export function getAllAdapters(): IEngineAdapter[] {
  return Array.from(registry.values());
}

/**
 * 初始化默认 Adapters（Phase 1: Pi + Grok + Mock 兜底）
 *
 * 行为：
 * - 尝试注册 Pi / Grok 真实适配器（失败不抛，仅 warn）
 * - 默认额外注册 MockEngineAdapter 作为兜底（可通过环境变量 USE_MOCK_ENGINE=false 关闭）
 * - 已注册 provider 不会重复注册（同名 mock 跳过）
 */
export async function initializeAdapters(
  extraAdapters: IEngineAdapter[] = [],
): Promise<void> {
  const useMock = process.env.USE_MOCK_ENGINE !== "false";

  const realAdapters: IEngineAdapter[] = [new PiAdapter(), new GrokAdapter()];
  for (const adapter of realAdapters) {
    try {
      await registerAdapter(adapter);
    } catch (err) {
      console.warn(
        `[engine] Failed to initialize ${adapter.name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (useMock) {
    // 仅为尚未注册的 provider 注册 mock 兜底
    for (const provider of [EngineProvider.PI, EngineProvider.GROK] as const) {
      if (!registry.has(provider)) {
        try {
          await registerAdapter(new MockEngineAdapter(provider));
          console.log(`[engine] Mock adapter registered for ${provider} (fallback)`);
        } catch (err) {
          console.warn(`[engine] Failed to register mock for ${provider}:`, err);
        }
      }
    }
  }

  // 最后再注册外部显式传入的 adapter（用于测试覆盖）
  for (const adapter of extraAdapters) {
    try {
      await registerAdapter(adapter);
    } catch (err) {
      console.warn(`[engine] Failed to initialize extra ${adapter.name}:`, err);
    }
  }
}

// ─── 路由调度 ─────────────────────────────────────────────────────

/**
 * 根据 provider 路由 prompt 请求到对应的 Adapter。
 *
 * 这是 Engine Bridge 的核心入口：
 *   const events = await routePrompt("PI", { sessionId, content, ... });
 *   for await (const event of events) { ... }
 *
 * 未来扩展 Grok 时，只需注册 GrokAdapter：
 *   await registerAdapter(new GrokAdapter());
 *   // routePrompt("GROK", ...) 自动路由
 */
export async function* routePrompt(
  provider: string,
  baseOptions: Omit<PromptOptions, "content"> & { content: string },
): AsyncIterable<NZiAgentEvent> {
  const adapter = getAdapter(provider);
  const options: PromptOptions = {
    ...baseOptions,
    content: baseOptions.content,
  };

  // 委托给 Adapter 的 streamPrompt
  // Adapter 内部使用对应的 Normalizer 进行事件转换
  yield* adapter.streamPrompt(options);
}

/**
 * 便捷方法：使用 EngineProvider 枚举路由
 */
export async function* routePromptByProvider(
  provider: EngineProvider,
  baseOptions: Omit<PromptOptions, "content"> & { content: string },
): AsyncIterable<NZiAgentEvent> {
  yield* routePrompt(provider, baseOptions);
}

// ─── 健康检查 ─────────────────────────────────────────────────────

export async function checkAllEngines(): Promise<Map<string, { healthy: boolean; latencyMs: number; detail?: string }>> {
  const results = new Map();
  for (const [name, adapter] of registry) {
    if (adapter.healthCheck) {
      results.set(name, await adapter.healthCheck());
    }
  }
  return results;
}
