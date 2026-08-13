/**
 * T005 — Arena HTTP Controller
 *
 * 职责：Arena 对战的 HTTP 接口
 * - POST /api/arena        创建一场对战（返回 matchId + 两个 side 的 sessionId）
 * - GET  /api/arena        列出当前租户的对战历史
 * - POST /api/arena/:id/vote  投票（A / B / tie）
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { TokenPayload } from "../config/auth.config.js";
import { ArenaService } from "../services/arena.service.js";

export class ArenaController {
  constructor(private arenaService: ArenaService) {}

  async create(req: FastifyRequest<{ Body: { prompt: string; thinkingLevel?: "off" | "low" | "medium" | "high" } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const { prompt, thinkingLevel = "off" } = req.body;
    if (!prompt || !prompt.trim()) return reply.status(400).send({ error: "prompt 不能为空" });

    const match = await this.arenaService.createMatch(user, prompt.trim(), thinkingLevel);
    return reply.status(201).send({
      matchId: match.id,
      prompt: match.prompt,
      thinkingLevel: match.thinkingLevel,
      sides: match.sides,
      createdAt: match.createdAt,
    });
  }

  async list(req: FastifyRequest, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });
    const matches = await this.arenaService.getAllMatches(user.tenantId);
    return reply.send({ matches });
  }

  async vote(req: FastifyRequest<{ Params: { id: string }; Body: { winner: "A" | "B" | "tie" } }>, reply: FastifyReply) {
    const user = req.user as TokenPayload | undefined;
    if (!user) return reply.status(401).send({ error: "未登录或登录已过期" });

    const { winner } = req.body;
    if (!winner || !["A", "B", "tie"].includes(winner)) {
      return reply.status(400).send({ error: "winner 必须是 A、B 或 tie" });
    }

    const match = await this.arenaService.getMatch(req.params.id);
    if (!match || match.tenantId !== user.tenantId) {
      return reply.status(404).send({ error: "对战不存在" });
    }

    const ok = await this.arenaService.vote(req.params.id, winner, user.tenantId);
    if (!ok) return reply.status(400).send({ error: "对战尚未结束，无法投票" });

    // 重新获取最新投票数
    const updatedMatch = await this.arenaService.getMatch(req.params.id);
    return reply.send({ ok: true, votes: updatedMatch?.votes ?? match.votes });
  }
}
