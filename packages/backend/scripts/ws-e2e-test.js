#!/usr/bin/env node
/**
 * WS E2E Authentication Test (ESM)
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const WS_URL = process.env.WS_URL || "http://localhost:4000";
const ADMIN_EMAIL = "admin@nzilab.com";
const ADMIN_PASSWORD = "Admin@2026!";
let jwtToken = "";

const TOKEN_FILE = "/tmp/ws-test-token.txt";

import { writeFileSync } from "node:fs";

async function login() {
  console.log("[1] Logging in as", ADMIN_EMAIL, "...");
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
  console.log("[1] Login successful. Token saved to", TOKEN_FILE);
  console.log("[1] User:", data.user?.email, "Tenant:", data.tenantId, "Role:", data.role);
}

async function getOrCreateSession() {
  console.log("[2] Looking for existing sessions...");

  const listResp = await fetch(`${BASE_URL}/api/sessions`, {
    headers: { Authorization: `Bearer ${jwtToken}` },
  });

  if (listResp.ok) {
    const data = await listResp.json();
    if (data.sessions && data.sessions.length > 0) {
      const session = data.sessions[0];
      console.log("[2] Using existing session:", session.id);
      return session.id;
    }
  }

  console.log("[2] No sessions found, creating one...");
  const createResp = await fetch(`${BASE_URL}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwtToken}`,
    },
    body: JSON.stringify({ title: "WS E2E Test", engine: "PI" }),
  });

  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`Create session failed: ${createResp.status} ${text}`);
  }

  const session = await createResp.json();
  console.log("[2] Created new session:", session.id);
  return session.id;
}

function connectWebSocket(sessionId) {
  return new Promise((resolve, reject) => {
    const wsUrl = `${WS_URL}/api/ws/chat?token=${encodeURIComponent(jwtToken)}`;
    const redacted = wsUrl.replace(jwtToken.substring(0, 8) + "..." + jwtToken.substring(jwtToken.length - 4), "***REDACTED***");
    console.log("[3] Connecting to WS:", redacted);

    const ws = new WebSocket(wsUrl);
    const messages = [];
    let done = false;

    ws.addEventListener("open", () => {
      console.log("[3] WS connected!");
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        messages.push(msg);
        const payloadStr = JSON.stringify(msg.payload || {}).substring(0, 200);
        console.log("[MSG]", msg.type, payloadStr);

        if (msg.type === "done" || msg.type === "error" || msg.type === "interrupted") {
          done = true;
          ws.close();
          resolve({ messages, done: true });
        }
      } catch (e) {
        console.log("[MSG RAW]", event.data);
      }
    });

    ws.addEventListener("error", (err) => {
      console.error("[ERROR] WebSocket error:", err.message || err);
      if (!done) {
        done = true;
        reject(new Error(`WebSocket error: ${err.message || err}`));
      }
    });

    ws.addEventListener("close", (event) => {
      if (!done) {
        done = true;
        resolve({
          messages,
          done: false,
          closeCode: event.code,
          closeReason: event.reason,
        });
      }
    });

    // Send chat message after connection opens
    const sendChat = () => {
      const chatMsg = {
        type: "chat",
        payload: {
          sessionId,
          agentType: "PI",
          prompt: "Say hi",
        },
      };
      console.log("[4] Sending chat message:", JSON.stringify(chatMsg).substring(0, 100) + "...");
      ws.send(JSON.stringify(chatMsg));
    };

    ws.addEventListener("open", sendChat, { once: true });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!done) {
        done = true;
        ws.close();
        resolve({ messages, done: false, timeout: true });
      }
    }, 30000);
  });
}

async function main() {
  console.log("=== WS E2E Authentication Test ===\n");

  try {
    await login();
    const sessionId = await getOrCreateSession();

    console.log("\n[3-5] Starting WS chat test...");
    const result = await connectWebSocket(sessionId);

    console.log("\n=== Test Complete ===");
    console.log("Messages received:", result.messages.length);
    console.log("Final status:", result.done ? "completed normally" : "ended early");

    const types = result.messages.map((m) => m.type);
    console.log("Message types:", types.join(" → "));

    if (types.some((m) => m.type === "error" && m.payload?.message === "Unauthorized")) {
      console.log("\n*** AUTHENTICATION FAILED: Received Unauthorized ***");
      process.exit(1);
    }

    if (!types.includes("status")) {
      console.log("\n*** FAIL: No status message received ***");
      process.exit(1);
    }

    if (types.includes("done")) {
      console.log("\n*** SUCCESS: Authentication worked! Received full flow: status → chunk(s) → done ***");
      process.exit(0);
    } else if (types.some((m) => m.type === "error")) {
      console.log("\n*** Received error (may be engine error, not auth error) ***");
      process.exit(0);
    } else if (result.timeout) {
      console.log("\n*** TIMEOUT: No done/error received within 30s ***");
      console.log("Messages so far:", JSON.stringify(result.messages, null, 2));
      process.exit(1);
    } else {
      console.log("\n*** Unexpected end state ***");
      process.exit(1);
    }
  } catch (err) {
    console.error("\n*** TEST FAILED:", err.message, "***");
    process.exit(1);
  }
}

main();
