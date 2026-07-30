import type { IEngineAdapter } from "@nzi/shared-types";
import { PiAdapter } from "./pi-adapter.js";
import { GrokAdapter } from "./grok-adapter.js";

/**
 * T003.3 — Engine Bridge 骨架
 *
 * 职责：统一调度入口
 *   provider: "PI"  → piAdapter.streamPrompt()
 *   provider: "GROK" → grokAdapter.streamPrompt()
 */
const adapters = new Map<string, IEngineAdapter>();

export function registerPiAdapter(adapter: IEngineAdapter): void {
  adapters.set("PI", adapter);
}

export function registerGrokAdapter(adapter: IEngineAdapter): void {
  adapters.set("GROK", adapter);
}

export function getAdapter(provider: string): IEngineAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new Error(`No adapter registered for provider: ${provider}`);
  }
  return adapter;
}

export async function initializeEngine(adapters: IEngineAdapter[]): Promise<void> {
  for (const adapter of adapters) {
    await adapter.initialize();
  }
}

// Phase 1 默认：只注册 Pi Adapter
export const defaultAdapters: IEngineAdapter[] = [new PiAdapter()];
