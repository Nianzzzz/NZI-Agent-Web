/**
 * WebSocket 路由
 *
 * - /api/ws/chat    普通单引擎聊天
 * - /api/ws/arena   Arena 双引擎并行对战
 */

import type { FastifyPluginAsync } from "fastify";
import type { TokenPayload } from "../config/auth.config.js";
import { WsChatController } from "../controllers/ws-chat.controller.js";
import { WsArenaController } from "../controllers/ws-arena.controller.js";

interface WsRequest {
  url: string;
  user?: TokenPayload;
}

const wsChatRoutes: FastifyPluginAsync = async (fastify) => {
  const sessionService = new (await import("../services/session.service.js")).SessionService(fastify.prisma);
  const verify = fastify.jwt.verify.bind(fastify.jwt) as (t: string) => unknown;

  const chatController = new WsChatController(sessionService, verify);
  fastify.get(
    "/api/ws/chat",
    { websocket: true },
    (connection, request) => {
      chatController.wsHandler(connection, request as unknown as WsRequest);
    },
  );

  const arenaController = new WsArenaController(
    new (await import("../services/arena.service.js")).ArenaService(sessionService),
    sessionService,
    verify,
  );
  fastify.get(
    "/api/ws/arena",
    { websocket: true },
    (connection, request) => {
      arenaController.wsHandler(connection, request as unknown as WsRequest);
    },
  );
};

export { wsChatRoutes };
