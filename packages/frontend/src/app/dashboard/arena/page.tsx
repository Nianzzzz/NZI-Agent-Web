"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, Cpu, Send, Square, Loader2, Sparkles,
  AlertCircle, CheckCircle2, Trophy, Vote,
  ChevronDown, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import Markdown from "@/components/chat/Markdown";
import AgentTimeline from "@/components/chat/AgentTimeline";
import type { TimelineNode } from "@/types/chat.types";

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000").replace(/^http/, "ws");

type SideLabel = "A" | "B";
type Winner = SideLabel | "tie" | null;

interface SideState {
  status: "idle" | "connecting" | "connected" | "streaming" | "completed" | "error" | "interrupted";
  content: string;
  nodes: TimelineNode[];
  error: string | null;
  latencyMs?: number;
  streamingMessageId?: string;
}

interface ArenaMatch {
  matchId: string;
  sides: { label: SideLabel; provider: "PI" | "GROK"; sessionId: string }[];
}

const ENGINE_COLORS: Record<string, string> = {
  PI: "from-violet-500 to-fuchsia-600",
  GROK: "from-amber-500 to-orange-600",
};

const ENGINE_LABELS: Record<string, string> = {
  PI: "Pi Agent",
  GROK: "Grok Agent",
};

const ENGINE_BG: Record<string, string> = {
  PI: "bg-violet-50 dark:bg-violet-950/20",
  GROK: "bg-amber-50 dark:bg-amber-950/20",
};

export default function ArenaPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [draft, setDraft] = useState("");
  const [thinkingLevel, setThinkingLevel] = useState<"off" | "low" | "medium" | "high">("off");
  const [match, setMatch] = useState<ArenaMatch | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sides, setSides] = useState<Record<SideLabel, SideState>>({
    A: { status: "idle", content: "", nodes: [], error: null },
    B: { status: "idle", content: "", nodes: [], error: null },
  });
  const [winner, setWinner] = useState<Winner>(null);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const wsRefs = useRef<Record<SideLabel, WebSocket | null>>({ A: null, B: null });

  const createMatch = useCallback(async (): Promise<ArenaMatch | null> => {
    const res = await fetch("/api/arena", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ prompt: draft.trim(), thinkingLevel }),
    });
    if (!res.ok) return null;
    return res.json();
  }, [draft, thinkingLevel, token]);

  const connectSide = useCallback((side: SideLabel, matchId: string) => {
    if (wsRefs.current[side]) return;
    const url = new URL(WS_URL);
    url.pathname = "/api/ws/arena";
    url.searchParams.set("matchId", matchId);
    url.searchParams.set("side", side);

    const ws = new WebSocket(url.toString(), token ? [token] : []);
    wsRefs.current[side] = ws;

    setSides((prev) => ({
      ...prev,
      [side]: { ...prev[side], status: "connecting", content: "", nodes: [], error: null },
    }));

    ws.addEventListener("open", () => {
      setSides((prev) => ({ ...prev, [side]: { ...prev[side], status: "connected" } }));
      // 发送 chat 消息
      ws.send(JSON.stringify({
        type: "chat",
        payload: { matchId, side, prompt: draft.trim(), thinkingLevel },
      }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type: string;
          payload: {
            delta?: string;
            node?: TimelineNode;
            content?: string;
            latencyMs?: number;
            nodes?: TimelineNode[];
            message?: string;
            reason?: string;
          };
        };
        setSides((prev) => {
          const cur = prev[side];
          switch (data.type) {
            case "node": {
              const node = data.payload.node;
              if (!node) return prev;
              const existing = cur.nodes;
              let newNodes = [...existing];
              if (node.phase === "start") {
                newNodes = [...existing, { ...node, status: "running", delta: undefined }];
              } else if (node.phase === "delta") {
                newNodes = existing.map((n) =>
                  n.id === node.id ? { ...n, delta: (n.delta ?? "") + (node.delta ?? "") } : n
                );
              } else if (node.phase === "end") {
                newNodes = existing.map((n) =>
                  n.id === node.id ? { ...n, status: "done", delta: node.delta } : n
                );
              }
              return { ...prev, [side]: { ...cur, nodes: newNodes, status: cur.status === "connected" ? "streaming" : cur.status } };
            }
            case "chunk": {
              const delta = data.payload.delta ?? "";
              if (!delta) return prev;
              return { ...prev, [side]: { ...cur, content: cur.content + delta, status: "streaming" } };
            }
            case "done": {
              const newNodes = data.payload.nodes ?? cur.nodes;
              return {
                ...prev,
                [side]: {
                  ...cur,
                  content: data.payload.content ?? cur.content,
                  nodes: newNodes,
                  status: "completed",
                  latencyMs: data.payload.latencyMs,
                },
              };
            }
            case "error":
              return { ...prev, [side]: { ...cur, status: "error", error: data.payload.message ?? "Unknown error" } };
            case "interrupted":
              return { ...prev, [side]: { ...cur, status: "interrupted", content: data.payload.content ?? cur.content } };
            default:
              return prev;
          }
        });
      } catch { /* ignore */ }
    });

    ws.addEventListener("close", () => {
      wsRefs.current[side] = null;
    });

    ws.addEventListener("error", () => {
      setSides((prev) => ({
        ...prev,
        [side]: { ...prev[side], status: "error", error: "WebSocket 连接失败" },
      }));
      wsRefs.current[side] = null;
    });
  }, [draft, thinkingLevel, token]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || isGenerating) return;
    setDraft("");
    setIsGenerating(true);
    setWinner(null);
    setVoteSubmitted(false);

    const newMatch = await createMatch();
    if (!newMatch) {
      setIsGenerating(false);
      return;
    }

    setMatch(newMatch);
    setSides({
      A: { status: "connecting", content: "", nodes: [], error: null },
      B: { status: "connecting", content: "", nodes: [], error: null },
    });

    // 同时连接两个 side
    connectSide("A", newMatch.matchId);
    connectSide("B", newMatch.matchId);
  };

  const handleStop = () => {
    for (const side of ["A", "B"] as SideLabel[]) {
      const ws = wsRefs.current[side];
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop", payload: {} }));
      }
    }
  };

  const handleVote = async (w: Winner) => {
    if (!match || voteSubmitted) return;
    try {
      await fetch(`/api/arena/${match.matchId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ winner: w }),
      });
    } catch { /* ignore */ }
    setWinner(w);
    setVoteSubmitted(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 检测两个 side 是否都完成
  useEffect(() => {
    if (!isGenerating) return;
    const a = sides.A.status;
    const b = sides.B.status;
    if ((a === "completed" || a === "error" || a === "interrupted") &&
        (b === "completed" || b === "error" || b === "interrupted")) {
      setIsGenerating(false);
    }
  }, [sides, isGenerating]);

  const sideA = sides.A;
  const sideB = sides.B;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      {/* ── 顶栏 ── */}
      <header className="shrink-0 border-b border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
              <Trophy className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground">Arena 对战</span>
          </div>
          <span className="text-xs text-slate-400">·</span>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Cpu className="h-3 w-3" />
            <span>Pi Agent</span>
            <span className="text-slate-300">vs</span>
            <span>Grok Agent</span>
          </div>
        </div>
      </header>

      {/* ── 主内容：双栏 ── */}
      <main className="flex-1 overflow-hidden">
        <div className="mx-auto flex h-full max-w-7xl gap-3 px-4 py-3">
          {/* Side A */}
          <ArenaPanel
            label="A"
            provider="PI"
            state={sideA}
            winner={winner === "A"}
            onVote={() => handleVote("A")}
            voteDisabled={voteSubmitted || (!sideA.content && sideA.status !== "completed")}
          />
          {/* Side B */}
          <ArenaPanel
            label="B"
            provider="GROK"
            state={sideB}
            winner={winner === "B"}
            onVote={() => handleVote("B")}
            voteDisabled={voteSubmitted || (!sideB.content && sideB.status !== "completed")}
          />
        </div>
      </main>

      {/* ── 投票栏 ── */}
      {sideA.status === "completed" && sideB.status === "completed" && !voteSubmitted && (
        <div className="shrink-0 border-t border-slate-200/60 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80">
          <div className="mx-auto flex max-w-2xl items-center justify-center gap-3">
            <Vote className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-500">哪个回答更好？</span>
            <Button size="sm" variant="outline" onClick={() => handleVote("A")} className="gap-1.5">
              <span className="font-semibold text-violet-600">A · Pi</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleVote("tie")} className="gap-1.5">
              <span className="text-slate-500">平局</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleVote("B")} className="gap-1.5">
              <span className="font-semibold text-amber-600">B · Grok</span>
            </Button>
          </div>
        </div>
      )}

      {voteSubmitted && winner && (
        <div className="shrink-0 border-t border-emerald-200/60 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="mx-auto flex max-w-2xl items-center justify-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            已投票：{winner === "tie" ? "平局" : `Side ${winner} 获胜`}
          </div>
        </div>
      )}

      {/* ── 输入区 ── */}
      <footer className="shrink-0 border-t border-slate-200/60 bg-white/80 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-2xl border border-slate-200 bg-white shadow-sm transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isGenerating ? "模型正在生成中…" : "输入问题，双引擎同时回答…"}
                rows={1}
                disabled={isGenerating}
                className="block w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
                style={{ minHeight: "44px", maxHeight: "200px" }}
              />
            </div>
            {isGenerating ? (
              <Button
                onClick={handleStop}
                size="lg"
                variant="destructive"
                className="h-11 w-11 shrink-0 rounded-2xl p-0"
                title="停止生成"
              >
                <Square className="h-4 w-4 fill-current" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                size="lg"
                disabled={!draft.trim()}
                className="h-11 w-11 shrink-0 rounded-2xl p-0 bg-gradient-to-br shadow-md from-blue-500 to-indigo-600 hover:opacity-90"
                title="发送"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Enter 发送 · Shift+Enter 换行 · 双引擎并行对比
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── 单侧面板 ─────────────────────────────────────────────────────

function ArenaPanel({
  label,
  provider,
  state,
  winner,
  onVote,
  voteDisabled,
}: {
  label: SideLabel;
  provider: "PI" | "GROK";
  state: SideState;
  winner: boolean;
  onVote: () => void;
  voteDisabled: boolean;
}) {
  const gradient = ENGINE_COLORS[provider];
  const bgColor = ENGINE_BG[provider];
  const isStreaming = state.status === "streaming";
  const hasNodes = state.nodes.length > 0;
  const isError = state.status === "error";
  const isInterrupted = state.status === "interrupted";
  const isCompleted = state.status === "completed";

  return (
    <div className={cn("flex w-1/2 flex-col rounded-2xl border p-4 transition-all", bgColor,
      winner ? "border-emerald-400 ring-2 ring-emerald-400/40" : "border-slate-200/60 dark:border-slate-800",
    )}>
      {/* 顶部标签 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white bg-gradient-to-br", gradient)}>
            {label}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white bg-gradient-to-r", gradient)}>
            {ENGINE_LABELS[provider]}
          </span>
          {isStreaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
          {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          {isError && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
        </div>
        {isCompleted && state.latencyMs != null && (
          <span className="text-[10px] text-slate-400">{state.latencyMs}ms</span>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {state.status === "connecting" && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            连接中…
          </div>
        )}
        {state.status === "idle" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-400">
            <Bot className="h-8 w-8 opacity-30" />
            <span className="text-sm">等待开始</span>
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {state.error}
          </div>
        )}
        {isInterrupted && !state.content && (
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <AlertCircle className="h-4 w-4" />
            生成已中断
          </div>
        )}
        {/* 推理过程 */}
        {hasNodes && (
          <div className="mb-3 rounded-lg border border-slate-200/60 bg-slate-50/70 dark:border-slate-700/50 dark:bg-slate-900/40">
            <AgentTimeline nodes={state.nodes} engineGradient="" />
          </div>
        )}
        {/* 最终答案 */}
        {state.content && (
          <Markdown>{state.content}</Markdown>
        )}
        {isStreaming && state.content && (
          <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-current align-middle text-slate-400" />
        )}
      </div>

      {/* 投票按钮（仅在完成且未投票时显示） */}
      {isCompleted && !winner && (
        <button
          type="button"
          onClick={onVote}
          disabled={voteDisabled}
          className={cn(
            "mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-all",
            voteDisabled
              ? "cursor-not-allowed border-slate-200 text-slate-300 dark:border-slate-800"
              : cn("border-current text-white bg-gradient-to-r hover:opacity-90", gradient),
          )}
        >
          <Vote className="h-4 w-4" />
          选择 Side {label}
        </button>
      )}
      {winner && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
          <Trophy className="h-4 w-4" />
          已选择
        </div>
      )}
    </div>
  );
}
