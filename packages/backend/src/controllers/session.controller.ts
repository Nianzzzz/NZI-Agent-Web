/**
 * Session Controller
 *
 * 职责：处理 Session 和 Message 相关的 HTTP 请求。
 * 所有操作均基于 tenantId 做租户隔离。
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { TokenPayload } from "../config/auth.config.js";
import { SessionService } from "../services/session.service.js";

export class SessionController {
  constructor(private sessionService: SessionService) {}

  /**
   * POST /api/sessions
   * 创建新会话
   */
  async create(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) {
      return reply.status(401).send({ error: "未登录或登录已过期" });
    }

    const { title } = req.body as { title?: string };

    const session = await this.sessionService.createSession({
      tenantId: user.tenantId,
      userId: user.sub,
      title,
    });

    return reply.status(201).send(session);
  }

  /**
   * GET /api/sessions
   * 获取当前租户的会话列表
   */
  async list(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) {
      return reply.status(401).send({ error: "未登录或登录已过期" });
    }

    const sessions = await this.sessionService.listSessions(
      user.tenantId,
      user.sub,
    );

    return reply.send({ sessions });
  }

  /**
   * GET /api/sessions/:id
   * 获取单个会话详情
   */
  async get(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) {
      return reply.status(401).send({ error: "未登录或登录已过期" });
    }

    const session = await this.sessionService.getSession(req.params.id, user.tenantId);
    if (!session) {
      return reply.status(404).send({ error: "会话不存在" });
    }

    return reply.send(session);
  }

  /**
   * DELETE /api/sessions/:id
   * 归档会话（软删除）
   */
  async archive(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) {
      return reply.status(401).send({ error: "未登录或登录已过期" });
    }

    const result = await this.sessionService.archiveSession(req.params.id, user.tenantId);
    return reply.send(result);
  }

  /**
   * GET /api/sessions/:id/messages
   * 获取会话的历史消息
   */
  async getMessages(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const user = req.user as TokenPayload | undefined;
    if (!user) {
      return reply.status(401).send({ error: "未登录或登录已过期" });
    }

    const limit = Number((req.query as { limit?: string })?.limit ?? 100);

    const messages = await this.sessionService.getMessages(
      req.params.id,
      user.tenantId,
      Math.min(limit, 500), // 上限 500
    );

    return reply.send({ messages });
  }
}
