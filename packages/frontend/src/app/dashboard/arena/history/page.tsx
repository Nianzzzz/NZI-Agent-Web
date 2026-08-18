/**
 * Arena 对战历史页
 *
 * 路由: /dashboard/arena/history
 *
 * 功能：
 * - 展示所有对战记录（prompt、时间、投票结果、胜率）
 * - 顶部统计卡片（总场数、Pi 胜率、Grok 胜率、平局率）
 * - 点击任意记录跳转到对战会话详情页
 * - 按 prompt 关键词搜索
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Trophy, Loader2, AlertCircle, CheckCircle2,
  Clock, Search, TrendingUp, BarChart3, ChevronRight,
  Sparkles, Vote, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { fetchArenaHistory, deleteArenaMatch, type ArenaHistoryItem } from "@/lib/chat-api";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "oldest" | "mostVoted";

export default function ArenaHistoryPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [items, setItems] = useState<ArenaHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [deleting, setDeleting] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    fetchArenaHistory()
      .then((data) => { setItems(data); setLoading(false); })
      .catch((e) => { setError(e instanceof Error ? e.message : "加载失败"); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!token) return;
    reload();
  }, [token, reload]);

  const handleDelete = useCallback(async (matchId: string) => {
    setDeleting(matchId);
    try {
      await deleteArenaMatch(matchId);
      setItems((prev) => prev.filter((m) => m.matchId !== matchId));
    } catch {
      // 删除失败不做特殊处理，刷新页面即可
    } finally {
      setDeleting(null);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    fetchArenaHistory()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载失败");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.prompt.toLowerCase().includes(q));
    }
    switch (sortKey) {
      case "newest":
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "oldest":
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "mostVoted":
        list.sort((a, b) => b.totalVotes - a.totalVotes);
        break;
    }
    return list;
  }, [items, search, sortKey]);

  const stats = useMemo(() => {
    const completed = items.filter((m) => m.status === "completed");
    const total = items.length;
    const piWins = completed.filter((m) => m.votes.A > m.votes.B).length;
    const grokWins = completed.filter((m) => m.votes.B > m.votes.A).length;
    const ties = completed.filter((m) => m.votes.A === m.votes.B && m.votes.A > 0).length;
    const totalVotes = completed.reduce((s, m) => s + m.totalVotes, 0);
    const piRate = total > 0 ? Math.round((piWins / total) * 100) : 0;
    const grokRate = total > 0 ? Math.round((grokWins / total) * 100) : 0;
    const tieRate = total > 0 ? Math.round((ties / total) * 100) : 0;
    return { total, piWins, grokWins, ties, totalVotes, piRate, grokRate, tieRate };
  }, [items]);

  if (loading && items.length === 0) {
    return (
      <PageShell>
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <p className="text-sm text-slate-500">正在加载对战历史…</p>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard/arena")}>
            返回 Arena
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* ── 统计卡片 ── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Trophy className="h-4 w-4 text-amber-500" />}
          label="总对战"
          value={stats.total}
          sub={`${stats.totalVotes} 次投票`}
          color="amber"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-violet-500" />}
          label="Pi 胜率"
          value={`${stats.piRate}%`}
          sub={`${stats.piWins} 胜`}
          color="violet"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-amber-500" />}
          label="Grok 胜率"
          value={`${stats.grokRate}%`}
          sub={`${stats.grokWins} 胜`}
          color="amber"
        />
        <StatCard
          icon={<BarChart3 className="h-4 w-4 text-slate-400" />}
          label="平局率"
          value={`${stats.tieRate}%`}
          sub={`${stats.ties} 场平局`}
          color="slate"
        />
      </section>

      {/* ── 搜索 + 排序 ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索提问关键词…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none transition focus:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <option key="newest" value="newest">最新优先</option>
          <option key="oldest" value="oldest">最旧优先</option>
          <option key="mostVoted" value="mostVoted">投票最多</option>
        </select>
      </div>

      {/* ── 列表 ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-100 dark:from-violet-950/40 dark:to-amber-950/40">
            <Sparkles className="h-6 w-6 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">暂无对战记录</p>
            <p className="mt-1 text-xs text-slate-400">去 Arena 发起第一场对战吧！</p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/arena")}
            className="mt-2 gap-1.5"
          >
            <Trophy className="h-3.5 w-3.5" />
            发起对战
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((match) => (
            <MatchRow
              key={match.matchId}
              match={match}
              deleting={deleting === match.matchId}
              onRemove={handleDelete}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

// ─── 布局壳 ───────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      <header className="shrink-0 border-b border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Link href="/dashboard/arena">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-amber-500 shadow-sm">
              <Trophy className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground">对战历史</span>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-5">
        {children}
      </main>
    </div>
  );
}

// ─── 统计卡片 ─────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  color: "violet" | "amber" | "slate";
}) {
  const border = color === "violet"
    ? "border-violet-200 bg-violet-50/50 dark:border-violet-900/30 dark:bg-violet-950/15"
    : color === "amber"
      ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/15"
      : "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40";
  return (
    <Card className={cn("border p-3 dark:border-slate-800", border)}>
      <CardContent className="flex items-center gap-2 p-0">
        <div className="shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
          <p className="truncate text-lg font-bold text-foreground">{value}</p>
          <p className="truncate text-[10px] text-slate-400">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 对战记录行 ───────────────────────────────────────────────────

function MatchRow({ match, deleting, onRemove }: {
  match: ArenaHistoryItem;
  deleting: boolean;
  onRemove: (matchId: string) => void;
}) {
  const date = new Date(match.createdAt);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = isToday
    ? `今天 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    : `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  const totalVotes = match.votes.A + match.votes.B + match.votes.tie;
  const winner: "A" | "B" | "tie" | null =
    match.status !== "completed" ? null
      : match.votes.A > match.votes.B ? "A"
        : match.votes.B > match.votes.A ? "B"
          : "tie";

  return (
    <div className="group relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60">
      {/* 点击跳转会话详情（删除按钮除外） */}
      <Link
        href={`/dashboard/session/${match.sessionId}`}
        className="absolute inset-0 z-0 rounded-xl"
        title="查看对战会话"
      />

      {/* 左侧：引擎色条 */}
      <div className={cn(
        "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm",
        "from-violet-500 to-fuchsia-600",
      )}>
        <Vote className="h-4 w-4" />
      </div>

      {/* 中间：prompt + 投票条 */}
      <div className="relative z-10 min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{match.prompt}</p>
        <div className="mt-1.5 flex items-center gap-2">
          {/* 投票进度条 */}
          {totalVotes > 0 ? (
            <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full bg-violet-500 transition-all"
                style={{ width: totalVotes ? `${(match.votes.A / totalVotes) * 100}%` : "0%" }}
              />
              <div
                className="h-full bg-slate-300 transition-all dark:bg-slate-600"
                style={{ width: totalVotes ? `${(match.votes.tie / totalVotes) * 100}%` : "0%" }}
              />
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: totalVotes ? `${(match.votes.B / totalVotes) * 100}%` : "0%" }}
              />
            </div>
          ) : (
            <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800" />
          )}
          <span className="shrink-0 text-[10px] text-slate-400">{totalVotes}票</span>
        </div>
      </div>

      {/* 右侧：状态 + 时间 + 结果 */}
      <div className="relative z-10 flex shrink-0 items-center gap-2">
        {match.status === "completed" && winner && (
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            winner === "A"
              ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
              : winner === "B"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
          )}>
            {winner === "tie" ? "平局" : winner === "A" ? "Pi 胜" : "Grok 胜"}
          </span>
        )}
        {match.status === "running" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Clock className="h-2.5 w-2.5" />
            进行中
          </span>
        )}
        <span className="text-[10px] text-slate-400">{timeStr}</span>
        <ChevronRight className="h-4 w-4 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />

        {/* 删除按钮（hover 显示） */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onRemove(match.matchId); }}
          disabled={deleting}
          className="ml-1 rounded p-1 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 disabled:opacity-50"
          title="删除对战记录"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
