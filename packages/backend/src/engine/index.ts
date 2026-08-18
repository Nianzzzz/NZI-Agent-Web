/**
 * Engine 模块入口
 *
 * 单一注册表由 engine-bridge 维护；此文件只做重导出，
 * 避免出现第二份 adapter registry。
 */

export {
  registerAdapter,
  getAdapter,
  getAllAdapters,
  initializeAdapters,
  routePrompt,
  routePromptByProvider,
  abortPrompt,
  checkAllEngines,
} from "./engine-bridge.js";

export { BailianAdapter, MockEngineAdapter, PiAdapter } from "./adapters/index.js";
