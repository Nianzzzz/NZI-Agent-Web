/**
 * PiAdapter.abort() 单元测试
 *
 * 验证 stop / abort 路径：
 * 1. 未注册的 requestId → abort 幂等忽略，不抛
 * 2. 已注册的 requestId → 调用 session.abort()，清理订阅与注册表
 * 3. session.abort() 抛错 → 仍清理注册表，不向上传播
 *
 * 注：不 mock SDK（动态 import 难以拦截），直接操作 _activeSessions 注册表
 * 来验证 abort 的行为契约。
 */

import { describe, it, expect, vi } from "vitest";
import { PiAdapter } from "../adapters/pi-adapter.js";

function makeAdapter() {
  const adapter = new PiAdapter();
  // 绕过 initialize() —— 直接标记可用，不触发 SDK 动态 import
  Object.assign(adapter, {
    _available: true as boolean,
    _sdkModule: null as unknown,
  });
  return adapter;
}

function getActiveSessions(adapter: PiAdapter) {
  return (adapter as unknown as { _activeSessions: Map<string, { session: unknown; unsubscribe: () => void }> })._activeSessions;
}

describe("PiAdapter.abort", () => {
  it("abort 对不存在的 requestId 幂等忽略", async () => {
    const adapter = makeAdapter();
    await expect(adapter.abort("sess_1", "no-such-request")).resolves.toBeUndefined();
  });

  it("abort 调用 session.abort() 并清理订阅与注册表", async () => {
    const adapter = makeAdapter();
    const unsubscribe = vi.fn();
    const abort = vi.fn().mockResolvedValue(undefined);
    const session = { abort };

    getActiveSessions(adapter).set("req_ok", { session, unsubscribe });

    await adapter.abort("sess_1", "req_ok");

    expect(abort).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(getActiveSessions(adapter).has("req_ok")).toBe(false);
  });

  it("session 没有 abort 方法时不抛", async () => {
    const adapter = makeAdapter();
    const unsubscribe = vi.fn();
    const session = {}; // 无 abort

    getActiveSessions(adapter).set("req_naked", { session, unsubscribe });

    await expect(adapter.abort("sess_1", "req_naked")).resolves.toBeUndefined();
    expect(getActiveSessions(adapter).has("req_naked")).toBe(false);
  });

  it("session.abort() 抛错时仍清理注册表且不向上传播", async () => {
    const adapter = makeAdapter();
    const unsubscribe = vi.fn();
    const abort = vi.fn().mockRejectedValue(new Error("network down"));
    const session = { abort };

    getActiveSessions(adapter).set("req_err", { session, unsubscribe });

    await expect(adapter.abort("sess_1", "req_err")).resolves.toBeUndefined();
    expect(abort).toHaveBeenCalledTimes(1);
    expect(getActiveSessions(adapter).has("req_err")).toBe(false);
  });

  it("unsubscribe 抛错时不向上传播", async () => {
    const adapter = makeAdapter();
    const unsubscribe = vi.fn().mockImplementation(() => { throw new Error("already closed"); });
    const abort = vi.fn().mockResolvedValue(undefined);
    const session = { abort };

    getActiveSessions(adapter).set("req_unsub_err", { session, unsubscribe });

    await expect(adapter.abort("sess_1", "req_unsub_err")).resolves.toBeUndefined();
    expect(getActiveSessions(adapter).has("req_unsub_err")).toBe(false);
  });
});
