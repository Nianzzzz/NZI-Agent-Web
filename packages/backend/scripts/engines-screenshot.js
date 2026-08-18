#!/usr/bin/env node
/**
 * Authenticated screenshot via Chrome DevTools Protocol.
 *
 * Drives a headless Edge:
 *  1. POST /api/auth/login to get a JWT
 *  2. Open /login in headless Edge
 *  3. Inject the JWT into localStorage so the auth-guard lets us through
 *  4. Navigate to /dashboard/engines
 *  5. Capture a PNG and write it to disk
 *
 * Usage: node scripts/engines-screenshot.js [outputPath]
 */

import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const EDGE_PATH = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = process.argv[2] || "screenshots/06-engines-page.png";
const ADMIN_EMAIL = process.env.WS_TEST_ADMIN_EMAIL || process.env.SCREENSHOT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.WS_TEST_ADMIN_PASSWORD || process.env.SCREENSHOT_ADMIN_PASSWORD;
const PROFILE_DIR = "C:/Users/zhaonian/AppData/Local/Temp/edge-cdp-profile";
const PORT = 9333;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set WS_TEST_ADMIN_EMAIL and WS_TEST_ADMIN_PASSWORD env vars.");
  process.exit(2);
}

let nextId = 1;
function nextReqId() {
  return nextId++;
}

async function login() {
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!resp.ok) {
    throw new Error(`Login failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.token;
}

async function startEdge() {
  console.log(`[edge] launching headless Edge on debug port ${PORT}…`);
  const proc = spawn(EDGE_PATH, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--window-size=1440,2200",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  proc.on("error", (e) => console.error("[edge] error:", e));
  proc.stderr?.on("data", () => {}); // swallow noise

  // Wait for /json/version
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) {
        const v = await r.json();
        console.log(`[edge] ready: ${v.Browser}`);
        return { proc, wsUrl: v.webSocketDebuggerUrl };
      }
    } catch {
      // not ready yet
    }
    await sleep(200);
  }
  throw new Error("Edge did not start within 10s");
}

async function attachToPage(wsUrl) {
  // Get the first page target
  const targetsResp = await fetch(`http://127.0.0.1:${PORT}/json`);
  const targets = await targetsResp.json();
  const page = targets.find((t) => t.type === "page") ?? targets[0];
  console.log(`[cdp] attaching to ${page.id}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const data = JSON.parse(ev.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextReqId();
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { ws, send, close: () => ws.close() };
}

async function navigateAndWait(cdp, url) {
  const loaded = new Promise((resolve) => {
    const handler = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.method === "Page.loadEventFired") {
        cdp.ws.removeEventListener("message", handler);
        resolve();
      }
    };
    cdp.ws.addEventListener("message", handler);
  });
  await cdp.send("Page.navigate", { url });
  await Promise.race([loaded, sleep(8000)]);
  await sleep(800); // small grace
}

async function evalJs(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(`JS error: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`);
  }
  return r.result.value;
}

async function capturePng(cdp) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png" });
  return Buffer.from(r.data, "base64");
}

async function main() {
  console.log("=== Authenticated Engines-page Screenshot ===\n");

  console.log("[login] fetching JWT…");
  const token = await login();
  console.log(`[login] token length=${token.length}`);

  const { proc, wsUrl } = await startEdge();
  let cdp;
  try {
    cdp = await attachToPage(wsUrl);

    // Enable Page + Runtime domains
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // 1. Go to origin first so localStorage is on the right origin
    await navigateAndWait(cdp, `${FRONTEND_URL}/login`);
    console.log("[cdp] on /login");

    // 2. Seed the token into localStorage (zustand persist format).
    const seedResult = await evalJs(cdp, `
      (async () => {
        const token = ${JSON.stringify(token)};
        const resp = await fetch("${BASE_URL}/api/auth/me", { headers: { Authorization: "Bearer " + token } });
        const me = resp.ok ? await resp.json() : null;
        const user = me ? { id: me.sub, email: me.email, displayName: me.email, role: me.role, tenantId: me.tenantId } : null;
        const authState = { state: { user, token, isAuthenticated: true }, version: 0 };
        localStorage.setItem("nzi-auth", JSON.stringify(authState));
        return { stored: !!localStorage.getItem("nzi-auth"), userEmail: user?.email };
      })()
    `);
    console.log("[cdp] seeded localStorage:", JSON.stringify(seedResult));

    // 3. Navigate to /login — the auth guard will see the seeded localStorage
    //    and redirect to /dashboard. Then click the "Engine capabilities" link.
    await navigateAndWait(cdp, `${FRONTEND_URL}/login`);
    await sleep(2500);
    let url = await evalJs(cdp, "location.href");
    console.log(`[cdp] after /login: url=${url}`);

    // 4. Click the "Engine capabilities" link on the dashboard page.
    //    The link is: <a href="/dashboard/engines">Engine capabilities</a>
    const clicked = await evalJs(cdp, `
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link = links.find(l => l.textContent?.includes('Engine capabilities'));
        if (link) { link.click(); return true; }
        return false;
      })()
    `);
    console.log(`[cdp] clicked Engine capabilities link: ${clicked}`);
    await sleep(3000);
    url = await evalJs(cdp, "location.href");
    const title = await evalJs(cdp, "document.title");
    const isAuth = await evalJs(cdp, "localStorage.getItem('nzi-auth') ? JSON.parse(localStorage.getItem('nzi-auth')).state.isAuthenticated : null");
    const h1 = await evalJs(cdp, "document.querySelector('h1')?.textContent || '(none)'");
    console.log(`[cdp] after click: url=${url} title=${title} isAuth=${isAuth} h1="${h1}"`);
    const hasEngines = url.includes("/dashboard/engines");

    // 5. Capture
    const png = await capturePng(cdp);
    writeFileSync(OUT, png);
    console.log(`\n[saved] ${OUT} (${png.length} bytes)`);
  } finally {
    cdp?.close?.();
    proc.kill();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
