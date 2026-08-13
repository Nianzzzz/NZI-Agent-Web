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

    const { title, engine } = req.body as {
      title?: string;
      engine?: "PI" | "GROK";
    };

    const session = await this.sessionService.createSession({
      tenantId: user.tenantId,
      userId: user.sub,
      title,
      engine,
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
   * DELETE /api/messages/:id
   * 删除单条消息（移除中断后的空消息等）
   */
  async deleteMessage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) {
      return reply.status(401).send({ error: "未登录或登录已过期" });
    }
    const result = await this.sessionService.deleteMessage(req.params.id, user.tenantId);
    if (!result) {
      return reply.status(404).send({ error: "消息不存在或无权限" });
    }
    return reply.send({ ok: true });
  }

  /**
   * DELETE /api/messages/:id/turn
   * 删除完整的对话轮次（user 消息 + 对应的 assistant 消息）
   * 用于"移除"整轮对话，刷新后不会回来
   */
  async deleteTurn(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    console.log("[deleteTurn] called, id:", req.params.id, "user:", user?.sub ?? "none");
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });
    const count = await this.sessionService.deleteTurn(req.params.id, user.tenantId);
    console.log("[deleteTurn] deleted count:", count);
    if (count === 0) return reply.status(404).send({ error: "消息不存在或无权限" });
    return reply.send({ deletedCount: count });
  }

  /**
   * PATCH /api/sessions/:id
   * 重命名会话
   */
  async rename(req: FastifyRequest<{ Params: { id: string }; Body: { title?: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) {
      return reply.status(401).send({ error: "未登录或登录已过期" });
    }
    const { title } = req.body;
    if (!title || !title.trim()) {
      return reply.status(400).send({ error: "标题不能为空" });
    }
    const session = await this.sessionService.renameSession(req.params.id, user.tenantId, title.trim());
    if (!session) {
      return reply.status(404).send({ error: "会话不存在" });
    }
    return reply.send(session);
  }

  /**
   * DELETE /api/messages/:id/after
   * 删除某条消息之后的所有消息（含该消息本身）
   * 用于编辑消息 / 重新生成场景
   */
  async deleteMessagesFrom(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });
    const count = await this.sessionService.deleteMessagesFrom(req.params.id, user.tenantId);
    if (count === 0) return reply.status(404).send({ error: "消息不存在或无权限" });
    return reply.send({ deletedCount: count });
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
