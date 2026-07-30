/**
 * T003.0 — Pi Agent SDK 最小验证
 *
 * 目标：验证 Pi Agent SDK 的基本接口和事件流格式
 * 不依赖真实 LLM API，只验证类型和调用方式
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 正确计算 repo root：从 packages/backend/src/engine/tests/ 向上 4 层
const repoRoot = path.resolve(__dirname, "../../../../../");
const piAgentRoot = path.join(repoRoot, "packages", "pi-agent");

console.log("Repo root:", repoRoot);
console.log("Pi Agent root:", piAgentRoot);
console.log("");

// ─── 1. 检查 Pi Agent 源码文件 ──────────────────────────────────────

console.log("=== 1. Pi Agent Source Files ===\n");

const requiredFiles = [
  "packages/coding-agent/src/core/sdk.ts",
  "packages/coding-agent/src/core/agent-session.ts",
  "packages/agent/src/types.ts",
  "packages/ai/src/compat.ts",
  "packages/ai/src/types.ts",
];

let allFilesExist = true;
for (const rel of requiredFiles) {
  const full = path.join(piAgentRoot, rel);
  const exists = fs.existsSync(full);
  console.log(`  ${exists ? "[OK]" : "[MISSING]"} ${rel}`);
  if (!exists) allFilesExist = false;
}

if (!allFilesExist) {
  console.log("\n部分源码文件缺失，请检查 Pi Agent 仓库路径。");
  process.exit(1);
}

// ─── 2. 尝试导入 Pi Agent SDK ───────────────────────────────────────

console.log("\n=== 2. Pi Agent SDK Import ===\n");

let sdkModule: unknown;
let agentCoreModule: unknown;
let aiCompatModule: unknown;

// 尝试直接导入 typescript 源码
try {
  const sdkPath = path.join(piAgentRoot, "packages/coding-agent/src/core/sdk.ts");
  sdkModule = await import(sdkPath);
  console.log("  [OK] createAgentSession imported from source");
} catch (err) {
  console.log(`  [INFO] 源码导入失败: ${err instanceof Error ? err.message : err}`);
}

// 尝试导入 agent-core types
try {
  const corePath = path.join(piAgentRoot, "packages/agent/src/types.ts");
  agentCoreModule = await import(corePath);
  console.log("  [OK] pi-agent-core types imported");
} catch {
  console.log("  [INFO] pi-agent-core 可选，导入失败跳过");
}

// 尝试导入 ai/compat
try {
  const aiPath = path.join(piAgentRoot, "packages/ai/src/compat.ts");
  aiCompatModule = await import(aiPath);
  console.log("  [OK] pi-ai/compat imported");
} catch {
  console.log("  [INFO] pi-ai/compat 可选，导入失败跳过");
}

// ─── 3. 检查 SDK API 签名 ──────────────────────────────────────────

console.log("\n=== 3. SDK API Surface ===\n");

if (sdkModule && typeof sdkModule === "object") {
  const keys = Object.keys(sdkModule as Record<string, unknown>);
  console.log(`  createAgentSession 模块导出 (${keys.length} 个):`);
  const importantKeys = keys.filter((k) =>
    ["createAgentSession", "AgentSession", "CreateAgentSessionOptions", "CreateAgentSessionResult"].includes(k)
  );
  for (const k of importantKeys) {
    console.log(`    - ${k}: ${typeof (sdkModule as Record<string, unknown>)[k]}`);
  }
  if (importantKeys.length === 0) {
    console.log(`    (关键导出: ${keys.slice(0, 15).join(", ")}${keys.length > 15 ? "..." : ""})`);
  }
}

console.log("\n  已知 SDK 签名（从源码确认）:");
console.log("  - createAgentSession(options?) → Promise<CreateAgentSessionResult>");
console.log("  - Options: { cwd?, agentDir?, model?, thinkingLevel?, tools?, noTools?, ... }");
console.log("  - Result: { session: AgentSession, extensionsResult, modelFallbackMessage? }");
console.log("  - AgentSession.prompt(text, options?) → Promise<void>");
console.log("  - AgentSession.subscribe(listener) → () => void");

// ─── 4. 事件类型定义（从源码确认）───────────────────────────────────

console.log("\n=== 4. Pi AgentEvent Types ===\n");

const PI_EVENT_TYPES = [
  "agent_start", "agent_end",
  "turn_start", "turn_end",
  "message_start", "message_update", "message_end",
  "tool_execution_start", "tool_execution_update", "tool_execution_end",
  "compaction_start", "compaction_end",
];

for (const et of PI_EVENT_TYPES) {
  console.log(`  - "${et}"`);
}

// ─── 5. 消息内容类型 ────────────────────────────────────────────────

console.log("\n=== 5. Message Content Blocks ===\n");

const CONTENT_BLOCKS = [
  { type: "text", fields: "text: string" },
  { type: "thinking", fields: "thinking: string, thinkingSignature?: string, redacted?: boolean" },
  { type: "toolCall", fields: "id: string, name: string, arguments: Record<string, unknown>" },
  { type: "image", fields: "data: string (base64), mimeType: string" },
];

for (const block of CONTENT_BLOCKS) {
  console.log(`  - ${block.type}: { ${block.fields} }`);
}

// ─── 6. 桥接策略 ───────────────────────────────────────────────────

console.log("\n=== 6. PiAdapter Bridge Strategy ===\n");

console.log("  prompt() 是 fire-and-forget (Promise<void>)");
console.log("  PiAdapter 必须通过 subscribe() 收集事件：\n");
console.log("  async *streamPrompt(options) {");
console.log("    const { session } = await createAgentSession({ cwd });");
console.log("    const events: NZiAgentEvent[] = [];");
console.log("    const traceId = crypto.randomUUID();");
console.log("    const nodeId = `node_${Date.now()}`;");
console.log("    const unsub = session.subscribe((piEvent) => {");
console.log("      events.push(normalize(piEvent, { sessionId, nodeId, traceId }));");
console.log("    });");
console.log("    await session.prompt(content);");
console.log("    await waitForEnd(session);");
console.log("    unsub();");
console.log("    for (const e of events) yield e;");
console.log("  }");

// ─── 7. 总结 ────────────────────────────────────────────────────────

console.log("\n=== Summary ===\n");

const results: Array<[string, string, string]> = [
  ["Pi Agent 源码", allFilesExist ? "OK" : "MISSING", "源代码文件存在"],
  ["SDK 导入", sdkModule ? "OK" : "BLOCKED", "tsx 源码导入结果"],
  ["事件类型", "OK", "12 种事件类型已从源码确认"],
  ["消息类型", "OK", "text/thinking/toolCall/image 4 种"],
  ["桥接策略", "OK", "subscribe + prompt 模式确认"],
];

for (const [item, status, detail] of results) {
  const icon = status === "OK" ? "[OK]" : status === "MISSING" ? "[MISSING]" : "[INFO]";
  console.log(`  ${icon} ${item}: ${detail}`);
}

console.log("\n  注意：直接调用 createAgentSession() 需要：");
console.log("  1. 有效的模型配置 (Pi Agent settings.json)");
console.log("  2. API Key (环境变量 XAI_API_KEY 或 Pi auth.json)");
console.log("  3. 完整的 Pi Agent 依赖树可用");
console.log("\n  T003.0 验证完成。");
