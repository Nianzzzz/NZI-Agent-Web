/**
 * NZi Agent Web — Backend Entry Point
 *
 * Phase 2: Auth + RESTful API + Prisma (PostgreSQL) + WebSocket Chat
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { PrismaClient } from "@prisma/client";
import { JWT_SECRET } from "./config/auth.config.js";
import { authRoutes, sessionRoutes } from "./routes/index.js";
import { wsChatRoutes } from "./routes/ws.route.js";
import { initializeAdapters } from "./engine/engine-bridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../../.env") });

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  },
});

// ─── Prisma 单例 ──────────────────────────────────────────────────

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

// ─── 插件注册 ─────────────────────────────────────────────────────

await fastify.register(helmet);
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
});

// JWT 插件: secret 通过环境变量注入，满足类型系统必填约束
// H-2: 添加 iss / aud 声明，防止跨环境 token 重放
await fastify.register(jwt, {
  secret: JWT_SECRET(),
  sign: {
    iss: "nzi-web",
    aud: "nzi-web-api",
  },
  verify: {
    allowedIss: "nzi-web",
    allowedAud: "nzi-web-api",
  },
});

// M-1: 速率限制 — 防止登录/注册爆破
// 跳过 WebSocket 路由（WS 升级请求是高频 GET，不应计入限流）
await fastify.register(import("@fastify/rate-limit"), {
  max: 100,
  timeWindow: "1 minute",
  allowList: (req) => req.url?.startsWith("/api/ws/") ?? false,
});
// WebSocket 插件
await fastify.register(websocket, {
  errorHandler: (error, socket, request) => {
    console.error("[ws] errorHandler:", error.message, "url:", request?.url);
    socket.close();
  },
});
// 监听 upgrade 事件用于调试
fastify.server.on("upgrade", (req, socket) => {
  console.log("[ws] server upgrade event:", req.url, "socket localPort:", (socket as { localPort?: number }).localPort);
});

// ─── Auth Hook: JWT 验证 ──────────────────────────────────────────

fastify.decorate("prisma", prisma);

fastify.addHook("onRequest", async (request, reply) => {
  // 跳过 auth 公开路由 和 WebSocket 长连接（WS 内部自行鉴权）
  const url = request.url;
  if (
    url.startsWith("/api/auth/") ||
    url.startsWith("/health") ||
    url.startsWith("/ready") ||
    url.startsWith("/api/ws/")
  ) {
    return;
  }

  try {
    const payload = (await request.jwtVerify()) as {
      sub: string;
      email: string;
      tenantId: string;
      role: string;
    };
    request.user = {
      sub: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  } catch {
    return reply.status(401).send({ error: "未登录或登录已过期" });
  }
});

// ─── Health Routes ────────────────────────────────────────────────

fastify.get("/health", async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", db: "healthy", timestamp: new Date().toISOString() };
  } catch {
    return { status: "ok", db: "unavailable", timestamp: new Date().toISOString() };
  }
});

fastify.get("/ready", async () => ({
  ready: true,
  timestamp: new Date().toISOString(),
}));

// ─── API Routes ───────────────────────────────────────────────────

fastify.register(async (instance) => {
  await instance.register(authRoutes);
  await instance.register(sessionRoutes);
});

// ─── WebSocket Routes ────────────────────────────────────────────

fastify.register(async (instance) => {
  await instance.register(wsChatRoutes);
});

// ─── Error Handler ────────────────────────────────────────────────

fastify.setErrorHandler((error, _request, reply) => {
  fastify.log.error({ err: error }, "Unhandled error");
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: string }).message)
      : "Internal Server Error";
  reply.status(statusCode).send({ error: message });
});

// ─── Graceful Shutdown ────────────────────────────────────────────

const gracefulShutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, shutting down gracefully...`);
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// ─── Start ────────────────────────────────────────────────────────

const start = async () => {
  try {
    // 初始化 Engine Adapters（真实失败时由 mock 兜底）
    await initializeAdapters();
    const port = Number(process.env.PORT || 4000);
    const host = process.env.HOST || "0.0.0.0";
    await fastify.listen({ port, host });
    console.log(`🚀 NZi Backend running at http://${host}:${port}`);
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
};

start();
