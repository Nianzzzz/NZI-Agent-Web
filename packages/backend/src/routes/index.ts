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
import { AuthService } from "../services/auth.service.js";
import { SessionService } from "../services/session.service.js";

// ─── 公有路由（无需 JWT） ─────────────────────────────────────────

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // 包装 sign 方法，统一推断为 (payload, expiresIn?) => Promise<string>
  const signToken = async (payload: unknown, expiresIn?: number) =>
    fastify.jwt.sign(payload as never, expiresIn ? { expiresIn } : undefined);

  const authService = new AuthService(fastify.prisma, signToken);
  const controller = new AuthController(authService);

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
  fastify.delete<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (req, reply) => controller.archive(req as never, reply as never),
  );
  fastify.get<{ Params: { id: string } }>(
    "/api/sessions/:id/messages",
    async (req, reply) => controller.getMessages(req as never, reply as never),
  );
};

export { authRoutes, sessionRoutes };
