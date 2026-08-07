/**
 * T004 Phase 2 — WebSocket 路由
 *
 * 当前只注册一个聊天长连接端点：
 * - /api/ws/chat（需要 query token，鉴权在 ws-chat.controller.ts 内处理）
 */

import type { FastifyPluginAsync } from "fastify";
import type { TokenPayload } from "../config/auth.config.js";
import { WsChatController } from "../controllers/ws-chat.controller.js";

interface WsRequest {
  url: string;
  user?: TokenPayload;
}

const wsChatRoutes: FastifyPluginAsync = async (fastify) => {
  const sessionService = new (await import("../services/session.service.js")).SessionService(fastify.prisma);
  const controller = new WsChatController(
    sessionService,
    fastify.jwt.verify.bind(fastify.jwt) as (t: string) => unknown,
  );

  fastify.get(
    "/api/ws/chat",
    { websocket: true },
    (connection, request) => {
      const req = request as unknown as WsRequest;
      controller.wsHandler(connection, req);
    },
  );
};

export { wsChatRoutes };
