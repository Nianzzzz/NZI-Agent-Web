/**
 * API Routes — 集中路由注册
 *
 * 两层结构：
 * - 公有路由（No auth required）：/api/auth/*
 * - 受保护路由（需 JWT）：/api/sessions/*
 */

import type { FastifyPluginAsync } from "fastify";
import { AuthController } from "../controllers/auth.controller.js";
import { SessionController } from "../controllers/session.controller.js";
import { ArenaController } from "../controllers/arena.controller.js";
import { EngineConfigController } from "../controllers/engine-config.controller.js";
import { AuthService } from "../services/auth.service.js";
import { SessionService } from "../services/session.service.js";
import { ArenaService } from "../services/arena.service.js";
import { EngineConfigService } from "../services/engine-config.service.js";

// ─── 公有路由（无需 JWT） ─────────────────────────────────────────

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // 包装 sign 方法，统一推断为 (payload, expiresIn?) => Promise<string>
  const signToken = async (
    payload: unknown,
    expiresIn?: string | number,
  ) => fastify.jwt.sign(payload as never, expiresIn ? { expiresIn } : undefined);

  const authService = new AuthService(fastify.prisma, signToken);
  const redis = (fastify as unknown as { redis?: import("ioredis").Redis }).redis;
  const controller = new AuthController(authService, redis);

  fastify.post(
    "/api/auth/register",
    async (req, reply) => controller.register(req as never, reply as never),
  );
  fastify.post(
    "/api/auth/login",
    async (req, reply) => controller.login(req as never, reply as never),
  );
  fastify.get(
    "/api/auth/me",
    async (req, reply) => controller.me(req as never, reply as never),
  );
  fastify.post(
    "/api/auth/logout",
    async (req, reply) => controller.logout(req as never, reply as never),
  );
};

// ─── 受保护路由（需 JWT） ─────────────────────────────────────────

const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  const sessionService = new SessionService(fastify.prisma);
  const controller = new SessionController(sessionService);

  fastify.post(
    "/api/sessions",
    async (req, reply) => controller.create(req as never, reply as never),
  );
  fastify.get(
    "/api/sessions",
    async (req, reply) => controller.list(req as never, reply as never),
  );
  fastify.get<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (req, reply) => controller.get(req as never, reply as never),
  );
  fastify.post<{ Params: { id: string }; Body: { forkFromMessageId?: string } }>(
    "/api/sessions/:id/fork",
    async (req, reply) => controller.fork(req as never, reply as never),
  );
  fastify.get<{ Params: { id: string } }>(
    "/api/sessions/:id/tree",
    async (req, reply) => controller.getTree(req as never, reply as never),
  );
  fastify.patch<{ Params: { id: string }; Body: { title?: string } }>(
    "/api/sessions/:id",
    async (req, reply) => controller.rename(req as never, reply as never),
  );
  fastify.delete<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (req, reply) => controller.archive(req as never, reply as never),
  );
  fastify.delete<{ Params: { id: string } }>(
    "/api/messages/:id",
    async (req, reply) => controller.deleteMessage(req as never, reply as never),
  );
  fastify.get<{ Params: { id: string } }>(
    "/api/sessions/:id/messages",
    async (req, reply) => controller.getMessages(req as never, reply as never),
  );
};

// ─── Arena 路由（需 JWT） ──────────────────────────────────────────

const arenaRoutes: FastifyPluginAsync = async (fastify) => {
  const sessionService = new SessionService(fastify.prisma);
  const arenaService = new ArenaService(sessionService);
  const controller = new ArenaController(arenaService);

  fastify.post(
    "/api/arena",
    async (req, reply) => controller.create(req as never, reply as never),
  );
  fastify.get(
    "/api/arena",
    async (req, reply) => controller.list(req as never, reply as never),
  );
  fastify.post<{ Params: { id: string }; Body: { winner: "A" | "B" | "tie" } }>(
    "/api/arena/:id/vote",
    async (req, reply) => controller.vote(req as never, reply as never),
  );
};

// ─── 引擎配置路由（需 JWT） ──────────────────────────────────────

const engineConfigRoutes: FastifyPluginAsync = async (fastify) => {
  const engineConfigService = new EngineConfigService(fastify.prisma);
  const controller = new EngineConfigController(engineConfigService);

  fastify.get(
    "/api/engine-config",
    async (req, reply) => controller.list(req as never, reply as never),
  );
  fastify.put<{ Params: { provider: "PI" | "GROK" } }>(
    "/api/engine-config/:provider",
    async (req, reply) => controller.upsert(req as never, reply as never),
  );
  fastify.delete<{ Params: { provider: "PI" | "GROK" } }>(
    "/api/engine-config/:provider",
    async (req, reply) => controller.remove(req as never, reply as never),
  );
};

// ─── 诊断路由（无需 JWT） ─────────────────────────────────────────

const engineRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/engine/health", async (_req, reply) => {
    const { checkAllEngines } = await import("../engine/engine-bridge.js");
    const results = await checkAllEngines();
    const rows: Record<string, unknown>[] = [];
    for (const [name, health] of results) {
      rows.push({
        name,
        healthy: health.healthy,
        latencyMs: health.latencyMs,
        detail: health.detail,
      });
    }
    return {
      loaded: rows.length > 0,
      engines: rows,
      env: {
        BAILIAN_API_KEY: process.env.BAILIAN_API_KEY
          ? process.env.BAILIAN_API_KEY.slice(0, 8) + "…" + process.env.BAILIAN_API_KEY.slice(-4)
          : "(unset)",
        BAILIAN_MODEL: process.env.BAILIAN_MODEL ?? "(unset)",
        GROK_MODEL: process.env.GROK_MODEL ?? "(unset)",
      },
    };
  });
};

export { authRoutes, sessionRoutes, engineRoutes, arenaRoutes, engineConfigRoutes };
