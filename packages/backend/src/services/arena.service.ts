/**
 * T005 — Arena Service
 *
 * 职责：管理 Arena 对战（双引擎并行生成 + 投票统计），持久化到 PostgreSQL
 *
 * 设计：
 * - 每场对战（ArenaMatch）对应一个独立的 Arena 会话（Session.arenaMatchId 关联）
 * - 两个 side（A=PI, B=GROK）的消息都写入同一个会话，通过 Message.arenaSide 区分
 * - 投票结果通过 ArenaVote 表持久化
 * - 多轮对话：每轮追加新的 A/B 消息对到同一会话
 */

import type { EngineProvider } from "@nzi/shared-types";
import type { PrismaClient } from "@prisma/client";
import { SessionService } from "../services/session.service.js";
import type { TokenPayload } from "../config/auth.config.js";

export interface ArenaSide {
  provider: EngineProvider;
  label: "A" | "B";
  /** 两个 side 共享同一个 sessionId */
  sessionId: string;
}

export interface ArenaMatch {
  id: string;
  tenantId: string;
  userId: string;
  prompt: string;
  thinkingLevel: "off" | "low" | "medium" | "high";
  sides: [ArenaSide, ArenaSide];
  status: "running" | "completed";
  createdAt: number;
  completedAt?: number;
  votes: { A: number; B: number; tie: number };
}

/** 每场对战的活跃请求上下文（按 side label 索引） */
export interface ArenaRequestCtx {
  abortController: AbortController;
  texts: string[];
}

export class ArenaService {
  /** 活跃请求上下文（内存态，重启后丢失但 WS 本身也会断开，不需要持久化） */
  private requests = new Map<string, Map<"A" | "B", ArenaRequestCtx>>();

  constructor(
    private sessionService: SessionService,
    private prisma: PrismaClient,
  ) {}

  /** 创建一场新的 Arena 对战 — 创建一个专属 Arena 会话 */
  async createMatch(
    user: TokenPayload,
    prompt: string,
    thinkingLevel: "off" | "low" | "medium" | "high",
  ): Promise<ArenaMatch> {
    // 创建一个专属 Arena 会话（两个 side 共享）
    const session = await this.sessionService.createSession({
      tenantId: user.tenantId,
      userId: user.sub,
      title: `⚔️ Arena: ${prompt.slice(0, 30)}`,
      engine: "PI", // 默认，实际是两个引擎并行
    });

    const thinkingLevelEnum = this._toDbThinkingLevel(thinkingLevel);

    // 持久化到 DB
    const dbMatch = await this.prisma.arenaMatch.create({
      data: {
        tenantId: user.tenantId,
        userId: user.sub,
        prompt: prompt.trim(),
        thinkingLevel: thinkingLevelEnum,
        status: "RUNNING",
      },
    });

    // 将 session 与 match 关联
    await this.prisma.session.update({
      where: { id: session.id },
      data: { arenaMatchId: dbMatch.id },
    });

    const match: ArenaMatch = {
      id: dbMatch.id,
      tenantId: user.tenantId,
      userId: user.sub,
      prompt: prompt.trim(),
      thinkingLevel,
      sides: [
        { provider: "PI" as EngineProvider, label: "A", sessionId: session.id },
        { provider: "GROK" as EngineProvider, label: "B", sessionId: session.id },
      ],
      status: "running",
      createdAt: dbMatch.createdAt.getTime(),
      votes: { A: 0, B: 0, tie: 0 },
    };
    this.requests.set(match.id, new Map());
    return match;
  }

  /** 获取单场对战详情 */
  async getMatch(id: string): Promise<ArenaMatch | null> {
    const dbMatch = await this.prisma.arenaMatch.findUnique({
      where: { id },
      include: { votes: true },
    });
    if (!dbMatch) return null;

    // 找到关联的 Arena 会话
    const arenaSession = await this.prisma.session.findFirst({
      where: { arenaMatchId: id },
      select: { id: true, engine: true },
    });
    if (!arenaSession) return null;

    return {
      id: dbMatch.id,
      tenantId: dbMatch.tenantId,
      userId: dbMatch.userId,
      prompt: dbMatch.prompt,
      thinkingLevel: this._fromDbThinkingLevel(dbMatch.thinkingLevel),
      sides: [
        { provider: "PI" as EngineProvider, label: "A", sessionId: arenaSession.id },
        { provider: "GROK" as EngineProvider, label: "B", sessionId: arenaSession.id },
      ],
      status: dbMatch.status === "RUNNING" ? "running" : "completed",
      createdAt: dbMatch.createdAt.getTime(),
      completedAt: dbMatch.completedAt?.getTime(),
      votes: {
        A: dbMatch.votes.filter((v) => v.provider === "PI").length,
        B: dbMatch.votes.filter((v) => v.provider === "GROK").length,
        tie: 0,
      },
    };
  }

  /** 获取租户下所有对战历史 */
  async getAllMatches(tenantId: string): Promise<ArenaMatch[]> {
    const dbMatches = await this.prisma.arenaMatch.findMany({
      where: { tenantId },
      include: { votes: true },
      orderBy: { createdAt: "desc" },
    });

    return Promise.all(
      dbMatches.map(async (dbMatch) => {
        const arenaSession = await this.prisma.session.findFirst({
          where: { arenaMatchId: dbMatch.id },
          select: { id: true },
        });

        return {
          id: dbMatch.id,
          tenantId: dbMatch.tenantId,
          userId: dbMatch.userId,
          prompt: dbMatch.prompt,
          thinkingLevel: this._fromDbThinkingLevel(dbMatch.thinkingLevel),
          sides: [
            { provider: "PI" as EngineProvider, label: "A", sessionId: arenaSession?.id ?? "" },
            { provider: "GROK" as EngineProvider, label: "B", sessionId: arenaSession?.id ?? "" },
          ],
          status: dbMatch.status === "RUNNING" ? "running" : "completed",
          createdAt: dbMatch.createdAt.getTime(),
          completedAt: dbMatch.completedAt?.getTime(),
          votes: {
            A: dbMatch.votes.filter((v) => v.provider === "PI").length,
            B: dbMatch.votes.filter((v) => v.provider === "GROK").length,
            tie: 0,
          },
        };
      }),
    );
  }

  /** 标记对战完成 */
  async completeMatch(id: string): Promise<void> {
    await this.prisma.arenaMatch.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  registerRequest(matchId: string, side: "A" | "B", ctx: ArenaRequestCtx): void {
    const reqs = this.requests.get(matchId);
    if (reqs) reqs.set(side, ctx);
  }

  getRequestCtx(matchId: string, side: "A" | "B"): ArenaRequestCtx | undefined {
    return this.requests.get(matchId)?.get(side);
  }

  completeSide(matchId: string, side: "A" | "B"): void {
    const reqs = this.requests.get(matchId);
    if (reqs) reqs.delete(side);
    // 两个 side 都完成 → 整场对战完成
    if (reqs && reqs.size === 0) {
      this.completeMatch(matchId).catch(() => {});
    }
  }

  /** 投票 */
  async vote(matchId: string, winner: "A" | "B" | "tie", tenantId: string): Promise<boolean> {
    const dbMatch = await this.prisma.arenaMatch.findUnique({
      where: { id: matchId },
    });
    if (!dbMatch || dbMatch.tenantId !== tenantId) return false;
    if (dbMatch.status !== "COMPLETED") return false;

    if (winner === "A") {
      await this.prisma.arenaVote.create({
        data: { matchId, provider: "PI" },
      });
    } else if (winner === "B") {
      await this.prisma.arenaVote.create({
        data: { matchId, provider: "GROK" },
      });
    }
    // tie: 不创建 vote 记录
    return true;
  }

  async getStats(): Promise<{ total: number; running: number; completed: number }> {
    const [total, running, completed] = await Promise.all([
      this.prisma.arenaMatch.count(),
      this.prisma.arenaMatch.count({ where: { status: "RUNNING" } }),
      this.prisma.arenaMatch.count({ where: { status: "COMPLETED" } }),
    ]);
    return { total, running, completed };
  }

  // ─── 私有方法 ──────────────────────────────────────────────────

  private _toDbThinkingLevel(level: "off" | "low" | "medium" | "high"): "OFF" | "LOW" | "MEDIUM" | "HIGH" {
    const map: Record<string, "OFF" | "LOW" | "MEDIUM" | "HIGH"> = {
      off: "OFF", low: "LOW", medium: "MEDIUM", high: "HIGH",
    };
    return map[level] ?? "OFF";
  }

  private _fromDbThinkingLevel(level: "OFF" | "LOW" | "MEDIUM" | "HIGH" | null): "off" | "low" | "medium" | "high" {
    const map: Record<string, "off" | "low" | "medium" | "high"> = {
      OFF: "off", LOW: "low", MEDIUM: "medium", HIGH: "high",
    };
    return level ? (map[level] ?? "off") : "off";
  }
}