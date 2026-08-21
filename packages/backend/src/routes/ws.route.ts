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
import { SkillService } from "../services/skill.service.js";
import { EngineConfigService } from "../services/engine-config.service.js";

interface WsRequest {
  url: string;
  user?: TokenPayload;
}

const wsChatRoutes: FastifyPluginAsync = async (fastify) => {
  const sessionService = new (await import("../services/session.service.js")).SessionService(fastify.prisma);
  const verify = fastify.jwt.verify.bind(fastify.jwt) as (t: string) => unknown;

  // ArenaService 必须在 HTTP 和 WS 之间共享（match 存在内存 Map 中）
  const arenaService = (fastify as unknown as { arenaService?: import("../services/arena.service.js").ArenaService }).arenaService;
  if (!arenaService) {
    throw new Error("ArenaService not decorated — index.ts must call fastify.decorate('arenaService', ...) before registering routes");
  }

  const skillService = (fastify as unknown as { skillService?: SkillService }).skillService ?? new SkillService(fastify.prisma);
  const engineConfigService = new EngineConfigService(fastify.prisma);
  const chatController = new WsChatController(sessionService, skillService, verify, engineConfigService);
  fastify.get(
    "/api/ws/chat",
    { websocket: true },
    (connection, request) => {
      chatController.wsHandler(connection, request as unknown as WsRequest);
    },
  );

  const arenaController = new WsArenaController(arenaService, sessionService, verify, engineConfigService);
  fastify.get(
    "/api/ws/arena",
    { websocket: true },
    (connection, request) => {
      arenaController.wsHandler(connection, request as unknown as WsRequest);
    },
  );
};

export { wsChatRoutes };
