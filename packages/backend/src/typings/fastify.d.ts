import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";

// ─── FastifyInstance 扩展 ─────────────────────────────────────────

declare module "fastify" {
  interface FastifyInstance {
    /** PrismaClient 实例（prisma 插件挂载） */
    prisma: PrismaClient;
  }
}

// ─── Request 用户上下文 ───────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    /** JWT 验证后的用户信息（auth hook 挂载，可选） */
    user?: {
      sub: string;
      email: string;
      tenantId: string;
      role: string;
    };
  }
}

export {};
