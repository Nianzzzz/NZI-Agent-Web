/**
 * T005 — Arena Service
 *
 * 职责：管理 Arena 对战（双引擎并行生成 + 投票统计）
 *
 * 设计：
 * - 每场对战（ArenaMatch）在内存中维护，包含两个 side（A=PI, B=GROK）
 * - 每个 side 独立流式生成，事件通过 sideChannel (WebSocket) 推送
 * - 投票结果在内存中统计；schema 已定义 ArenaMatch/ArenaVote 表，
 *   待 prisma db push 后可切换为持久化存储
 */

import type { EngineProvider } from "@nzi/shared-types";
import { SessionService } from "../services/session.service.js";
import type { TokenPayload } from "../config/auth.config.js";

export interface ArenaSide {
  provider: EngineProvider;
  label: "A" | "B";
  /** 该 side 的 sessionId（独立会话，用于隔离消息历史） */
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
interface ArenaRequestCtx {
  abortController: AbortController;
  texts: string[];
}

export class ArenaService {
  private matches = new Map<string, ArenaMatch>();
  private requests = new Map<string, Map<"A" | "B", ArenaRequestCtx>>();

  constructor(private sessionService: SessionService) {}

  /** 创建一场新的 Arena 对战 */
  async createMatch(user: TokenPayload, prompt: string, thinkingLevel: "off" | "low" | "medium" | "high"): Promise<ArenaMatch> {
    const id = crypto.randomUUID();
    // 为两个 side 各创建一个独立会话（隔离消息历史）
    const [sessionA, sessionB] = await Promise.all([
      this.sessionService.createSession({ tenantId: user.tenantId, userId: user.sub, title: `Arena A: ${prompt.slice(0, 30)}`, engine: "PI" }),
      this.sessionService.createSession({ tenantId: user.tenantId, userId: user.sub, title: `Arena B: ${prompt.slice(0, 30)}`, engine: "GROK" }),
    ]);

    const match: ArenaMatch = {
      id,
      tenantId: user.tenantId,
      userId: user.sub,
      prompt,
      thinkingLevel,
      sides: [
        { provider: "PI" as EngineProvider, label: "A", sessionId: sessionA.id },
        { provider: "GROK" as EngineProvider, label: "B", sessionId: sessionB.id },
      ],
      status: "running",
      createdAt: Date.now(),
      votes: { A: 0, B: 0, tie: 0 },
    };
    this.matches.set(id, match);
    this.requests.set(id, new Map());
    return match;
  }

  getMatch(id: string): ArenaMatch | undefined {
    return this.matches.get(id);
  }

  getAllMatches(tenantId: string): ArenaMatch[] {
    return Array.from(this.matches.values())
      .filter((m) => m.tenantId === tenantId)
      .sort((a, b) => b.createdAt - a.createdAt);
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
      const match = this.matches.get(matchId);
      if (match) {
        match.status = "completed";
        match.completedAt = Date.now();
      }
    }
  }

  vote(matchId: string, winner: "A" | "B" | "tie"): boolean {
    const match = this.matches.get(matchId);
    if (!match || match.status !== "completed") return false;
    if (winner === "tie") {
      match.votes.tie += 1;
    } else {
      match.votes[winner] += 1;
    }
    return true;
  }

  getStats(): { total: number; running: number; completed: number } {
    const all = Array.from(this.matches.values());
    return {
      total: all.length,
      running: all.filter((m) => m.status === "running").length,
      completed: all.filter((m) => m.status === "completed").length,
    };
  }

  /** 清理已完成超过 30 分钟的匹配（防止内存泄漏） */
  pruneOldMatches(ttlMs = 30 * 60_000): void {
    const now = Date.now();
    for (const [id, match] of this.matches) {
      if (match.status === "completed" && match.completedAt && now - match.completedAt > ttlMs) {
        this.matches.delete(id);
        this.requests.delete(id);
      }
    }
  }
}
