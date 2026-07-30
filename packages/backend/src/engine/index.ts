import type { IEngineAdapter } from "@nzi/shared-types";
import { PiAdapter } from "./adapters/pi-adapter.js";
import { GrokAdapter } from "./adapters/grok-adapter.js";

const registry = new Map<string, IEngineAdapter>();

export function getAdapter(name: string): IEngineAdapter | undefined {
  return registry.get(name);
}

export function getAllAdapters(): IEngineAdapter[] {
  return Array.from(registry.values());
}

export async function registerAdapter(adapter: IEngineAdapter): Promise<void> {
  if (registry.has(adapter.name)) {
    throw new Error(`Adapter "${adapter.name}" is already registered`);
  }
  await adapter.initialize();
  registry.set(adapter.name, adapter);
}

export async function initializeAdapters(adapters: IEngineAdapter[] = []): Promise<void> {
  // Phase 1: 默认注册 Pi Adapter
  const defaults = [new PiAdapter(), ...adapters];
  for (const adapter of defaults) {
    try {
      await registerAdapter(adapter);
    } catch (err) {
      console.warn(`[engine] Failed to initialize ${adapter.name}:`, err);
    }
  }
}
