/**
 * T009 — Session 聊天详情页
 *
 * 路由: /dashboard/session/[id]
 * 布局:
 *   - 顶栏: 返回 + engine 徽章 + session 标题 + 连接状态
 *   - 中部: 消息流（用户/AI 气泡，AI 流式 typewriting + 闪烁光标）
 *   - 底部: 输入区 (发送 / 停止切换)
 *   - 首次加载: GET /api/sessions/:id + GET /api/sessions/:id/messages
 *   - 实时: WebSocket /api/ws/chat?token=&sessionId=
 */
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Bot, Cpu, Send, Square, Loader2,
  Sparkles, AlertCircle, CheckCircle2, MessageSquare, User as UserIcon, Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { useChatSocket } from "@/hooks/use-chat-socket";
import { useChatStore, type ChatMessage } from "@/stores/chat.store";
import { fetchSessionDetail, fetchSessionMessages, type SessionDetail } from "@/lib/chat-api";
import AgentTimeline from "@/components/chat/AgentTimeline";
import { cn } from "@/lib/utils";

const ENGINE_META: Record<"PI" | "GROK", { label: string; gradient: string; ring: string }> = {
  PI: {
    label: "Pi Agent",
    gradient: "from-violet-500 to-fuchsia-600",
    ring: "ring-violet-300/60",
  },
  GROK: {
    label: "Grok Agent",
    gradient: "from-amber-500 to-orange-600",
    ring: "ring-amber-300/60",
  },
};

function MessageBubble({ message, engineGradient }: {
  message: ChatMessage;
  engineGradient: string;
}) {
  const isUser = message.role === "user";
  const hasTimeline = !isUser && message.nodes && message.nodes.length > 0;
  return (
    <div className={cn("flex w-full gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
            engineGradient,
          )}
        >
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
          isUser
            ? "rounded-tr-sm bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-blue-500/20"
            : message.status === "error"
              ? "rounded-tl-sm border border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
              : message.status === "interrupted"
                ? "rounded-tl-sm border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                : "rounded-tl-sm border border-slate-200/60 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
        )}
      >
        <div className="whitespace-pre-wrap break-words">
          {message.content || (
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              thinking…
            </span>
          )}
          {message.status === "streaming" && (
            <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-current align-middle" />
          )}
        </div>

        {/* T010: Agent Loop Timeline */}
        {hasTimeline && (
          <AgentTimeline nodes={message.nodes!} engineGradient={engineGradient} />
        )}

        {message.status === "interrupted" && (
          <p className="mt-2 flex items-center gap-1 text-[11px] opacity-70">
            <AlertCircle className="h-3 w-3" />
            生成已被中断
          </p>
        )}
        {message.status === "error" && (
          <p className="mt-2 flex items-center gap-1 text-[11px] opacity-70">
            <AlertCircle className="h-3 w-3" />
            出错了
          </p>
        )}
        {message.status === "completed" && message.latencyMs != null && (
          <p className="mt-2 flex items-center gap-1 text-[10px] opacity-50">
            <CheckCircle2 className="h-3 w-3" />
            {message.latencyMs}ms
          </p>
        )}
      </div>
      {isUser && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <UserIcon className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

export default function SessionChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id ?? "";

  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [thinkingLevel, setThinkingLevel] = useState<"off" | "low" | "medium" | "high">("off");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const historyLoadedRef = useRef(false);

  const replaceMessages = useChatStore((s) => s.replaceMessages);

  const {
    connectionStatus,
    connectionError,
    messages,
    streamingMessage,
    isGenerating,
    sendChat,
    stopGeneration,
  } = useChatSocket({ sessionId, token, autoConnect: true });

  // ─── 加载 session 详情 + 历史消息 ───────────────────────────
  useEffect(() => {
    if (!sessionId || !token) return;
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        const [detail, history] = await Promise.all([
          fetchSessionDetail(sessionId),
          fetchSessionMessages(sessionId),
        ]);
        if (cancelled) return;

        if (!detail) {
          setLoadError("会话不存在或已被删除");
          setIsLoading(false);
          return;
        }

        setSession(detail);
        if (!historyLoadedRef.current) {
          // 整体替换：清掉之前的临时消息（如刷新页面后遗留的 user_xxx 临时 ID），
          // 用 DB 里的权威消息替换，避免与 API 里的 cuid 重复
          replaceMessages(
            sessionId,
            history.map((m) => ({
              id: m.id,
              sessionId: m.sessionId,
              role: m.role === "USER" ? "user" : m.role === "TOOL_RESULT" ? "tool_result" : "assistant",
              content: m.content,
              reasoning: m.reasoning ?? undefined,
              status: m.status === "COMPLETED" ? "completed" : "interrupted",
              createdAt: new Date(m.createdAt),
              latencyMs: m.latencyMs ?? undefined,
            })),
          );
          historyLoadedRef.current = true;
        }
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "加载失败");
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, token, replaceMessages]);

  // ─── 合并消息流（历史 + 当前 streaming） ───────────────────
  const renderedMessages = useMemo<ChatMessage[]>(() => {
    const list: ChatMessage[] = [...messages];
    if (streamingMessage) list.push(streamingMessage);
    return list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [messages, streamingMessage]);

  // ─── 自动滚到底部 ───────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [renderedMessages.length, streamingMessage?.content]);

  // ─── 发送消息 ────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || isGenerating) return;
    sendChat(text, (session?.engine ?? "PI") as "PI" | "GROK", thinkingLevel);
    setDraft("");
  }, [draft, isGenerating, sendChat, session?.engine, thinkingLevel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 px-4 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
        <Card className="max-w-md border-red-200 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/30">
          <CardContent className="space-y-3 py-8 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">{loadError}</h2>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回工作台
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const engine = (session?.engine ?? "PI") as "PI" | "GROK";
  const meta = ENGINE_META[engine];

  return (
    <div className="flex h-screen flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      {/* ── 顶栏 ─────────────────────────────────── */}
      <header className="shrink-0 border-b border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            title="返回工作台"
          >
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          <div className={cn("h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br text-white shadow-md ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-950", meta.gradient, meta.ring)}>
            <div className="flex h-full w-full items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {session?.title || "未命名会话"}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full bg-gradient-to-r px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white",
                meta.gradient,
              )}>
                <Cpu className="h-2.5 w-2.5" />
                {meta.label}
              </span>
              <span>·</span>
              <ConnectionPill status={connectionStatus} />
              {engine === "PI" && (
                <>
                  <span>·</span>
                  <ThinkingLevelPill value={thinkingLevel} onChange={setThinkingLevel} disabled={isGenerating} />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── 消息流 ───────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
          {isLoading && renderedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              正在加载会话…
            </div>
          ) : renderedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-950/50 dark:to-indigo-950/50">
                <Sparkles className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">开始对话</h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  下面的输入框里写任何问题，{meta.label} 会逐字流式回复。
                </p>
              </div>
              <SuggestionChips onPick={(t) => setDraft(t)} />
            </div>
          ) : (
            renderedMessages.map((m) => (
              <MessageBubble key={m.id} message={m} engineGradient={meta.gradient} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {connectionError && (
        <div className="shrink-0 border-t border-red-200 bg-red-50/80 px-4 py-2 text-center text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {connectionError} — 正在尝试重连…
        </div>
      )}

      {/* ── 输入区 ───────────────────────────────── */}
      <footer className="shrink-0 border-t border-slate-200/60 bg-white/80 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-2xl border border-slate-200 bg-white shadow-sm transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isGenerating ? `${meta.label} 正在回复…` : `向 ${meta.label} 提问…`}
                rows={1}
                disabled={connectionStatus !== "connected" && !isGenerating}
                className="block w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
                style={{ minHeight: "44px", maxHeight: "200px" }}
              />
            </div>
            {isGenerating ? (
              <Button
                onClick={stopGeneration}
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
                disabled={!draft.trim() || connectionStatus !== "connected"}
                className={cn("h-11 w-11 shrink-0 rounded-2xl p-0 bg-gradient-to-br shadow-md", meta.gradient, "hover:opacity-90")}
                title="发送"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Enter 发送 · Shift+Enter 换行 · 由 <span className="font-medium text-foreground">{meta.label}</span> 驱动
            {user?.email && (
              <>
                {" · "}已登录为 <span className="font-medium text-foreground">{user.email}</span>
              </>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}

function ThinkingLevelPill({
  value,
  onChange,
  disabled,
}: {
  value: "off" | "low" | "medium" | "high";
  onChange: (v: "off" | "low" | "medium" | "high") => void;
  disabled?: boolean;
}) {
  const OPTIONS: { key: "off" | "low" | "medium" | "high"; label: string; color: string }[] = [
    { key: "off", label: "思考关", color: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    { key: "low", label: "低", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    { key: "medium", label: "中", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
    { key: "high", label: "高", color: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300" },
  ];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Brain className="h-3 w-3 text-muted-foreground" />
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.key)}
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition",
            opt.color,
            value === opt.key
              ? "ring-2 ring-offset-1 ring-blue-400 dark:ring-offset-slate-950"
              : "opacity-60 hover:opacity-100",
            disabled && "pointer-events-none opacity-40",
          )}
          title={`思维链级别：${opt.label}`}
        >
          {opt.label}
        </button>
      ))}
    </span>
  );
}

function ConnectionPill({ status }: { status: "idle" | "connecting" | "connected" | "disconnected" | "error" }) {
  const map = {
    idle: { text: "未连接", color: "bg-slate-300" },
    connecting: { text: "连接中", color: "bg-amber-400 animate-pulse" },
    connected: { text: "已连接", color: "bg-emerald-500" },
    disconnected: { text: "已断开", color: "bg-slate-400" },
    error: { text: "连接失败", color: "bg-red-500" },
  } as const;
  const m = map[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", m.color)} />
      {m.text}
    </span>
  );
}

function SuggestionChips({ onPick }: { onPick: (text: string) => void }) {
  const chips = [
    "用 TypeScript 写一个防抖 hook",
    "解释 React Server Components 的工作机制",
    "如何设计一个可观测的 WebSocket 协议？",
    "帮我写一段 PostgreSQL 性能优化清单",
  ];
  return (
    <div className="mt-2 flex max-w-md flex-wrap justify-center gap-2">
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/30"
        >
          <MessageSquare className="h-3 w-3" />
          {c}
        </button>
      ))}
    </div>
  );
}
