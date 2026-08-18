#!/usr/bin/env node
/**
 * WS Fold-Fix Smoke Test
 *
 * 验证：thinking 节点在 end 事件中保留 delta，
 * 从而前端可以折叠查看思考过程。
 *
 * 退出码：
 *   0 - 全部断言通过
 *   1 - 任何断言失败 / 超时
 */

import { writeFileSync } from "node:fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const WS_URL = process.env.WS_URL || "http://localhost:4000";
// Credentials are read from env to avoid committing secrets.
// Set WS_TEST_ADMIN_EMAIL and WS_TEST_ADMIN_PASSWORD before running,
// or copy from .env.test (gitignored) — see .env.example.
const ADMIN_EMAIL = process.env.WS_TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.WS_TEST_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Missing WS_TEST_ADMIN_EMAIL / WS_TEST_ADMIN_PASSWORD env vars.");
  console.error("Example: WS_TEST_ADMIN_EMAIL=admin@nzilab.com WS_TEST_ADMIN_PASSWORD=*** node scripts/ws-fold-test.js");
  process.exit(2);
}
const TOKEN_FILE = "/tmp/ws-fold-test-token.txt";

let jwtToken = "";

function redact(token) {
  if (token.length < 12) return "***";
  return token.substring(0, 8) + "..." + token.substring(token.length - 4);
}

async function login() {
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Login failed: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  jwtToken = data.token;
  writeFileSync(TOKEN_FILE, jwtToken, "utf8");
  console.log(`[1] Login OK (token=${redact(jwtToken)})`);
  return data;
}

async function getOrCreateSession() {
  const listResp = await fetch(`${BASE_URL}/api/sessions`, {
    headers: { Authorization: `Bearer ${jwtToken}` },
  });
  if (listResp.ok) {
    const data = await listResp.json();
    if (data.sessions && data.sessions.length > 0) {
      const session = data.sessions[0];
      console.log(`[2] Reuse session: ${session.id}`);
      return session.id;
    }
  }
  const createResp = await fetch(`${BASE_URL}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwtToken}` },
    body: JSON.stringify({ title: "Fold Test", engine: "PI" }),
  });
  if (!createResp.ok) {
    throw new Error(`Create session failed: ${createResp.status} ${await createResp.text()}`);
  }
  const session = await createResp.json();
  console.log(`[2] Created session: ${session.id}`);
  return session.id;
}

function connectAndCollect(sessionId) {
  return new Promise((resolve, reject) => {
    const wsUrl = `${WS_URL}/api/ws/chat?token=${encodeURIComponent(jwtToken)}`;
    const ws = new WebSocket(wsUrl);
    const messages = [];
    let done = false;

    ws.addEventListener("open", () => {
      console.log(`[3] WS open. Sending chat prompt.`);
      ws.send(JSON.stringify({
        type: "chat",
        payload: { sessionId, agentType: "PI", prompt: "Fold test" },
      }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        messages.push(msg);
        if (msg.type === "node") {
          const n = msg.payload?.node;
          if (n) {
            const phase = n.phase ?? "?";
            const type = n.type ?? "?";
            const deltaPreview = n.delta ? `Δ=${(n.delta).slice(0, 30).replace(/\n/g, " ")}${n.delta.length > 30 ? "..." : ""}` : "Δ=∅";
            console.log(`  [node] type=${type} phase=${phase} ${deltaPreview}`);
          }
        } else if (msg.type === "status") {
          console.log(`  [status]`, msg.payload?.text ?? "");
        } else if (msg.type === "chunk") {
          // skip
        } else {
          console.log(`  [${msg.type}]`, JSON.stringify(msg.payload || {}).slice(0, 120));
        }
        if (msg.type === "done" || msg.type === "error" || msg.type === "interrupted") {
          done = true;
          ws.close();
          resolve({ messages, done: true });
        }
      } catch (e) {
        console.log(`  [RAW]`, String(event.data).slice(0, 100));
      }
    });

    ws.addEventListener("error", (err) => {
      if (!done) {
        done = true;
        reject(new Error(`WebSocket error: ${err.message || err}`));
      }
    });

    ws.addEventListener("close", (event) => {
      if (!done) {
        done = true;
        resolve({ messages, done: false, closeCode: event.code, closeReason: event.reason });
      }
    });

    setTimeout(() => {
      if (!done) {
        done = true;
        ws.close();
        resolve({ messages, done: false, timeout: true });
      }
    }, 30000);
  });
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`);
    return false;
  }
  console.log(`  ✓ ${msg}`);
  return true;
}

async function main() {
  console.log("=== WS Fold-Fix Smoke Test ===\n");
  let allOk = true;
  try {
    await login();
    const sessionId = await getOrCreateSession();
    const { messages } = await connectAndCollect(sessionId);

    console.log(`\nReceived ${messages.length} messages.\n`);

    // 提取所有 node 事件，按 nodeId 分组
    const byNodeId = new Map();
    for (const m of messages) {
      if (m.type !== "node") continue;
      const n = m.payload?.node;
      if (!n) continue;
      const id = n.id;
      if (!byNodeId.has(id)) byNodeId.set(id, []);
      byNodeId.get(id).push(n);
    }

    // 验证：至少有一个 thinking 节点
    const thinkingNodes = [];
    for (const [id, evs] of byNodeId.entries()) {
      const startEv = evs.find((e) => e.phase === "start");
      if (startEv?.type === "thinking") thinkingNodes.push({ id, evs });
    }

    console.log(`\n[ASSERT] Found ${thinkingNodes.length} thinking node(s).\n`);
    allOk = assert(thinkingNodes.length >= 1, "At least one thinking node was emitted") && allOk;

    // 验证：每个 thinking 节点都有 start/delta/end 三个事件
    for (const { id, evs } of thinkingNodes) {
      const phases = evs.map((e) => e.phase);
      console.log(`  thinking node ${id}: phases = ${phases.join(", ")}`);
      allOk = assert(phases.includes("start"), `thinking ${id} has start phase`) && allOk;
      allOk = assert(phases.includes("end"), `thinking ${id} has end phase`) && allOk;
    }

    // 验证：end 事件携带 delta（关键 fold 修复）
    console.log(`\n[ASSERT] end event carries accumulated delta (the fix):\n`);
    for (const { id, evs } of thinkingNodes) {
      const deltas = evs.filter((e) => e.phase === "delta").map((e) => e.delta ?? "").join("");
      const endEv = evs.find((e) => e.phase === "end");
      const endDelta = endEv?.delta ?? "";
      console.log(`  thinking ${id}: accumulated delta length = ${deltas.length}, end.delta length = ${endDelta.length}`);
      allOk = assert(endDelta.length > 0, `thinking ${id} end event has non-empty delta (allows folding)`) && allOk;
      allOk = assert(deltas === endDelta, `thinking ${id} end.delta matches accumulated delta`) && allOk;
    }

    // 验证：answer 节点同理
    const answerNodes = [];
    for (const [id, evs] of byNodeId.entries()) {
      const startEv = evs.find((e) => e.phase === "start");
      if (startEv?.type === "answer") answerNodes.push({ id, evs });
    }
    console.log(`\n[ASSERT] Found ${answerNodes.length} answer node(s).\n`);
    if (answerNodes.length > 0) {
      const { id, evs } = answerNodes[0];
      const endEv = evs.find((e) => e.phase === "end");
      const endDelta = endEv?.delta ?? "";
      allOk = assert(endDelta.length > 0, `answer ${id} end event has non-empty delta`) && allOk;
    }

    console.log(`\n${allOk ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}\n`);
    process.exit(allOk ? 0 : 1);
  } catch (err) {
    console.error(`\n*** TEST FAILED: ${err.message} ***\n`);
    process.exit(1);
  }
}

main();
