/**
 * Phase 3 — Skill Controller
 *
 * 路由：
 * - GET    /api/skills             浏览 Skill 市场
 * - GET    /api/skills/:id         单个 Skill 详情
 * - POST   /api/skills             创建自定义 Skill
 * - PUT    /api/skills/:id         编辑 Skill
 * - DELETE /api/skills/:id         删除 Skill
 * - POST   /api/skills/:id/install    安装 Skill
 * - POST   /api/skills/:id/uninstall  卸载 Skill
 * - PUT    /api/skills/:id/toggle     启用/禁用
 * - GET    /api/user/skills        已安装的 Skill 列表
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { TokenPayload } from "../config/auth.config.js";
import { SkillService } from "../services/skill.service.js";

export class SkillController {
  constructor(private skillService: SkillService) {}

  /** GET /api/skills */
  async list(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const query = req.query as {
      category?: string;
      search?: string;
      sort?: "popular" | "newest" | "rating";
    };
    const skills = await this.skillService.list({
      category: query.category,
      search: query.search,
      sort: query.sort,
      userId: user.sub,
    });
    return reply.send({ skills });
  }

  /** GET /api/skills/:id */
  async get(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const skill = await this.skillService.getById(req.params.id);
    if (!skill) return reply.status(404).send({ error: "Skill 不存在" });
    return reply.send({ skill });
  }

  /** POST /api/skills */
  async create(
    req: FastifyRequest<{
      Body: {
        name: string;
        displayName: string;
        description: string;
        category: string;
        icon?: string;
        tags?: string[];
        prompt: string;
        tools?: string[];
        isPublic?: boolean;
      };
    }>,
    reply: FastifyReply,
  ) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const { name, displayName, description, category, prompt } = req.body;
    if (!name?.trim() || !displayName?.trim() || !description?.trim() || !prompt?.trim()) {
      return reply.status(400).send({ error: "name, displayName, description, prompt 为必填项" });
    }

    const skill = await this.skillService.create(req.body, user.sub, user.tenantId);
    return reply.status(201).send({ skill });
  }

  /** PUT /api/skills/:id */
  async update(
    req: FastifyRequest<{
      Params: { id: string };
      Body: {
        displayName?: string;
        description?: string;
        category?: string;
        icon?: string;
        tags?: string[];
        prompt?: string;
        tools?: string[];
        isPublic?: boolean;
      };
    }>,
    reply: FastifyReply,
  ) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const skill = await this.skillService.update(req.params.id, req.body, user.sub);
    if (!skill) return reply.status(404).send({ error: "Skill 不存在或无权限" });
    return reply.send({ skill });
  }

  /** DELETE /api/skills/:id */
  async delete(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const ok = await this.skillService.delete(req.params.id, user.sub);
    if (!ok) return reply.status(404).send({ error: "Skill 不存在或无权限" });
    return reply.send({ ok: true });
  }

  /** POST /api/skills/:id/install */
  async install(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    await this.skillService.install(req.params.id, user.sub);
    return reply.send({ ok: true });
  }

  /** POST /api/skills/:id/uninstall */
  async uninstall(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    await this.skillService.uninstall(req.params.id, user.sub);
    return reply.send({ ok: true });
  }

  /** PUT /api/skills/:id/toggle */
  async toggle(
    req: FastifyRequest<{ Params: { id: string }; Body: { enabled: boolean } }>,
    reply: FastifyReply,
  ) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    await this.skillService.toggleEnabled(req.params.id, user.sub, req.body.enabled);
    return reply.send({ ok: true });
  }

  /** GET /api/user/skills */
  async getInstalled(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const skills = await this.skillService.getInstalled(user.sub);
    return reply.send({ skills });
  }
}