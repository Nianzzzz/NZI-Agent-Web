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
import redis from "@fastify/redis";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { JWT_SECRET } from "./config/auth.config.js";
import { authRoutes, sessionRoutes, engineRoutes, arenaRoutes, engineConfigRoutes } from "./routes/index.js";
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

// ─── Redis（JWT 撤销黑名单 + 会话级速率限制）─────────────────────
// 生产必须设置 REDIS_URL；开发环境无 Redis 时静默降级（拒绝撤销，允许所有 WS）
const redisClient = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    })
  : null;

if (redisClient) {
  await fastify.register(redis, { client: redisClient });
  redisClient.on("error", (err) => {
    fastify.log.error({ err: err.message }, "[redis] connection error");
  });
}

// M-1: 速率限制 — 防止登录/注册爆破（含 WS 握手）
await fastify.register(import("@fastify/rate-limit"), {
  max: 100,
  timeWindow: "1 minute",
});
// WebSocket 插件 — 限制单帧最大 1 MiB（防 DoS）
// maxPayload 透传给底层 ws 库（@fastify/websocket 类型未暴露，需类型断言）
// @ts-expect-error maxPayload is a valid `ws` ServerOptions field
await fastify.register(websocket, {
  maxPayload: 1024 * 1024, // 1 MiB
  errorHandler: (error, socket, request) => {
    console.error("[ws] errorHandler:", error.message, "url:", request?.url);
    socket.close();
  },
});
// 监听 upgrade 事件用于调试（屏蔽 token 防止日志泄露）
fastify.server.on("upgrade", (req, socket) => {
  const safeUrl = (req.url ?? "").replace(/(\?|&)(token=)[^&]*/g, "$1$2***");
  console.log(
    "[ws] server upgrade event:",
    safeUrl,
    "socket localPort:",
    (socket as { localPort?: number }).localPort,
  );
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
    url.startsWith("/api/ws/") ||
    url.startsWith("/api/engine/")
  ) {
    return;
  }

  try {
    const payload = (await request.jwtVerify()) as {
      sub: string;
      email: string;
      tenantId: string;
      role: string;
      jti: string;
    };
    // JWT 撤销黑名单检查
    if (redisClient && payload.jti) {
      const revoked = await redisClient.exists(`revoked:${payload.jti}`);
      if (revoked) {
        return reply.status(401).send({ error: "Token 已撤销，请重新登录" });
      }
    }
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
  await instance.register(engineRoutes);
  await instance.register(arenaRoutes);
  await instance.register(engineConfigRoutes);
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
