/**
 * T009 — Session 聊天详情页
 *
 * 路由: /dashboard/session/[id]
 *
 * 设计要点：
 * - 推理过程在前（折叠方框），最终答案在后（Markdown 渲染）
 * - 智能滚动：用户上滑时暂停跟随，显示"回到最下方"箭头
 * - 一键复制答案内容
 * - 超过 3 轮对话时右侧显示会话快速跳转导航
 */
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Bot, Cpu, Send, Square, Loader2,
  Sparkles, AlertCircle, CheckCircle2, MessageSquare, User as UserIcon, Brain,
  ChevronDown, ChevronRight, Copy, Check, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { useChatSocket } from "@/hooks/use-chat-socket";
import { useChatStore, type ChatMessage } from "@/stores/chat.store";
import { fetchSessionDetail, fetchSessionMessages, deleteMessage, type SessionDetail } from "@/lib/chat-api";
import AgentTimeline from "@/components/chat/AgentTimeline";
import Markdown from "@/components/chat/Markdown";
import { cn } from "@/lib/utils";

const ENGINE_META = {
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
} as const;

/** 判断消息是否是 assistant 的最终回答（有实际内容） */
function isAssistantAnswer(m: ChatMessage): boolean {
  return m.role === "assistant" && m.status !== "error";
}

/** 判断消息是否是用户提问 */
function isUserMessage(m: ChatMessage): boolean {
  return m.role === "user";
}

// ─── 推理过程方框（外层容器 + 内部滚动，折叠由 AgentTimeline 负责）────

function ReasoningBox({ nodes }: {
  nodes: ChatMessage["nodes"];
}) {
  if (!nodes || nodes.length === 0) return null;
  const detailNodes = nodes.filter((n) => n.type !== "answer");
  if (detailNodes.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-slate-200/60 bg-slate-50/70 dark:border-slate-700/50 dark:bg-slate-900/40">
      <div className="p-3">
        <AgentTimeline nodes={nodes} engineGradient="" />
      </div>
    </div>
  );
}

// ─── 消息气泡 ─────────────────────────────────────────────────────

function MessageBubble({ message, engineGradient, onRemove, buffering }: {
  message: ChatMessage;
  engineGradient: string;
  onRemove?: (messageId: string) => void;
  buffering?: boolean;
}) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const hasNodes = !isUser && message.nodes && message.nodes.length > 0;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className={cn("flex w-full gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
            engineGradient,
          )}
        >
          <Bot className="h-4 w-4" />
        </div>
      )}
      {/* 缓冲提示：已发送请求但尚未收到首个 token（仅在当前 streaming 消息上显示） */}
      {!isUser && buffering && isStreaming && (
        <div className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-600 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="font-medium">正在思考中…</span>
          <span className="inline-flex gap-0.5">
            <span className="h-1 w-1 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
          </span>
        </div>
      )}
      <div
        className={cn(
          "group relative max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
          isUser
            ? "rounded-tr-sm bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-blue-500/20"
            : message.status === "error"
              ? "rounded-tl-sm border border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
              : message.status === "interrupted"
                ? "rounded-tl-sm border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                : "rounded-tl-sm border border-slate-200/60 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
        )}
      >
        {/* ── 推理过程（在前） ── */}
        {!isUser && hasNodes && (
          <ReasoningBox nodes={message.nodes} />
        )}

        {/* ── 最终答案（在后） ── */}
        <div className={cn(!isUser && hasNodes && "border-t border-slate-100 pt-2.5 dark:border-slate-800")}>
          {!isUser ? (
            <>
              {!message.content && !isStreaming && (
                <span className="inline-flex items-center gap-1.5 text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  思考中…
                </span>
              )}
              {message.content && (
                <>
                  <Markdown>{message.content}</Markdown>
                  {isStreaming && (
                    <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-current align-middle" />
                  )}
                </>
              )}
              {isStreaming && !message.content && (
                <span className="inline-flex items-center gap-1.5 text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  接收中…
                </span>
              )}
            </>
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )}
        </div>

        {/* ── 复制按钮（仅 assistant 答案） ── */}
        {!isUser && message.content && message.status === "completed" && (
          <button
            type="button"
            onClick={handleCopy}
            className="absolute -right-2 top-2 z-10 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            title="复制内容"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "已复制" : "复制"}
          </button>
        )}

        {/* ── 移除按钮（中断 / 出错的 assistant 消息） ── */}
        {!isUser && onRemove && (message.status === "interrupted" || message.status === "error") && (
          <button
            type="button"
            onClick={() => onRemove(message.id)}
            className="absolute -right-2 top-2 z-10 flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:border-amber-300 hover:text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            title="移除此消息"
          >
            <Trash2 className="h-3 w-3" />
            移除
          </button>
        )}

        {/* ── 状态信息 ── */}
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
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <UserIcon className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

// ─── 会话快速跳转导航 ────────────────────────────────────────────

interface TurnNav {
  /** 用户问题文本（截断预览） */
  preview: string;
  /** 该 turn 第一条消息的 DOM id */
  domId: string;
  /** turn 序号 */
  index: number;
}

function SessionNavigator({ turns, currentTurn }: {
  turns: TurnNav[];
  currentTurn: number | null;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  // 展开状态：hover 任意一个条目时展开全部，方便点击
  const expanded = hovered !== null;

  if (turns.length < 2) return null;

  return (
    <div
      className="fixed right-3 top-1/2 z-20 flex flex-col -translate-y-1/2 rounded-full border border-slate-200 bg-white/95 py-1.5 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      onMouseLeave={() => setHovered(null)}
    >
      {turns.map((turn) => {
        const active = currentTurn === turn.index;
        return (
          <button
            key={turn.domId}
            type="button"
            onClick={() => {
              document.getElementById(turn.domId)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            onMouseEnter={() => setHovered(turn.index)}
            className={cn(
              "relative flex items-center gap-2 rounded-full px-2 py-1 transition-all",
              active
                ? "bg-blue-500 text-white"
                : expanded
                  ? "w-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  : "w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600",
            )}
            title={turn.preview}
          >
            {/* 紧凑模式下的小圆点 */}
            {!expanded && (
              <span className={cn(
                "inline-block h-2 w-2 rounded-full",
                active ? "bg-white" : "bg-slate-400 dark:bg-slate-500",
              )} />
            )}
            {/* 展开时的横条文本 */}
            {expanded && (
              <span className="flex items-center gap-2 text-[10px] leading-tight">
                <span className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold",
                  active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
                )}>
                  {turn.index + 1}
                </span>
                <span className="max-w-[160px] truncate text-left">
                  {turn.preview}
                </span>
                {active && <span className="ml-auto shrink-0 text-[8px] opacity-70">当前</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── 主页面 ─────────────────────────────────────────────────────

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
  const [currentEngine, setCurrentEngine] = useState<"PI" | "GROK">("PI");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // 智能滚动：用户是否主动上滑离开了底部
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  // 生成期间用户上滑过 → 显示"回到最新"按钮；生成结束后自动清除
  const [showBackToLatest, setShowBackToLatest] = useState(false);
  const prevGeneratingRef = useRef(false);

  const replaceMessages = useChatStore((s) => s.replaceMessages);
  const removeMessage = useChatStore((s) => s.removeMessage);

  // 移除消息：先乐观更新 store，再调用后端 API
  const handleRemoveMessage = useCallback(
    async (messageId: string) => {
      removeMessage(sessionId, messageId);
      try {
        await deleteMessage(messageId);
      } catch {
        // 删除失败时不影响已有 UI（消息已从列表中移除）
      }
    },
    [sessionId, removeMessage],
  );

  // 滚动到最后一个用户问题（让用户一进来先看到自己提的问题，再往下看答案）
  const scrollToLastUserMessage = useCallback((userMsgIds: string[]) => {
    const el = scrollContainerRef.current;
    if (!el || userMsgIds.length === 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      return;
    }
    const lastId = userMsgIds[userMsgIds.length - 1];
    const lastEl = document.getElementById(`msg-${lastId}`);
    if (lastEl) {
      lastEl.scrollIntoView({ behavior: "auto", block: "start" });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, []);

  const {
    connectionStatus,
    connectionError,
    messages,
    streamingMessage,
    isGenerating,
    buffering,
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
        // 用会话的 engine 初始化当前引擎选择器
        if (detail.engine === "PI" || detail.engine === "GROK") {
          setCurrentEngine(detail.engine);
        }
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
            nodes: (m.timelineNodes as import("@/types/chat.types").TimelineNode[] | undefined) ?? undefined,
          })),
        );
        setIsLoading(false);
        // 初始加载完成后滚动到最后一个用户问题（而非答案末尾），
        // 让用户一进来就看到自己最后提的问题，答案在下方展开。
        const userIds = history.filter((m) => m.role === "USER").map((m) => m.id);
        requestAnimationFrame(() => {
          scrollToLastUserMessage(userIds);
        });
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "加载失败");
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, token, replaceMessages, scrollToLastUserMessage]);

  // ─── 合并消息流（历史 + 当前 streaming） ───────────────────
  const renderedMessages = useMemo<ChatMessage[]>(() => {
    const list: ChatMessage[] = [...messages];
    if (streamingMessage) list.push(streamingMessage);
    return list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [messages, streamingMessage]);

  // ─── 智能滚动 ───────────────────────────────────────────────
  // 用户滚动时更新状态：主动上滑 = 用户离开了底部
  const lastScrollTopRef = useRef(0);
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    // 只有用户主动向上滚动（scrollTop 减小超过阈值）才标记为"上滑"
    // 避免内容增长导致的 scroll 事件误判
    if (el.scrollTop < lastScrollTopRef.current - 20) {
      setUserScrolledUp(true);
      if (isGenerating) setShowBackToLatest(true);
    } else if (isAtBottom) {
      setUserScrolledUp(false);
    }
    lastScrollTopRef.current = el.scrollTop;
  }, [isGenerating]);

  // 生成结束 → 清除"回到最新"提示
  useEffect(() => {
    if (prevGeneratingRef.current && !isGenerating) {
      setShowBackToLatest(false);
      setUserScrolledUp(false);
    }
    prevGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // 主滚动循环：生成期间且用户未主动上滑时，每帧强制滚到底部。
  // 用 RAF 而不是 ResizeObserver，因为 React 流式更新时 content 逐字
  // 追加，RAF 能确保每一帧都跟随最新内容。
  const autoScrollEnabledRef = useRef(false);
  useEffect(() => {
    autoScrollEnabledRef.current = isGenerating && !userScrolledUp;
  }, [isGenerating, userScrolledUp]);

  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    let rafId: number;
    const tick = () => {
      if (!autoScrollEnabledRef.current) return;
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isGenerating]);

  // ResizeObserver：内容高度变化时（思考折叠/展开、新消息追加），
  // 若用户已在底部附近则自动跟随到底，避免"卡在上面"的情况。
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
        setUserScrolledUp(false);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = useCallback(() => {
    setUserScrolledUp(false);
    setShowBackToLatest(false);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  // ─── 发送消息 ────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || isGenerating) return;
    sendChat(text, currentEngine, thinkingLevel);
    setDraft("");
  }, [draft, isGenerating, sendChat, thinkingLevel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ─── 会话快速跳转：提取 turns（user + assistant 配对） ──────
  const turns: TurnNav[] = useMemo(() => {
    const result: TurnNav[] = [];
    for (let i = 0; i < renderedMessages.length; i++) {
      const m = renderedMessages[i];
      if (isUserMessage(m)) {
        result.push({
          preview: m.content.slice(0, 60),
          domId: `msg-${m.id}`,
          index: result.length,
        });
      }
    }
    return result;
  }, [renderedMessages]);

  // 当前可见的 turn（最接近视口中心的 turn）
  const [currentTurn, setCurrentTurn] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || turns.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        let bestRatio = 0;
        entries.forEach((entry) => {
          if (entry.intersectionRatio <= bestRatio) return;
          const idx = turns.findIndex((t) => t.domId === entry.target.id);
          if (idx >= 0) { bestRatio = entry.intersectionRatio; bestIdx = idx; }
        });
        if (bestIdx >= 0) setCurrentTurn(bestIdx);
      },
      { root: el, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    turns.forEach((t) => {
      const el2 = document.getElementById(t.domId);
      if (el2) observer.observe(el2);
    });
    return () => observer.disconnect();
  }, [turns, renderedMessages.length]);

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

  const meta = ENGINE_META[currentEngine];

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
              <span>·</span>
              <ThinkingLevelPill value={thinkingLevel} onChange={setThinkingLevel} disabled={isGenerating} />
              <span>·</span>
              <EngineSwitcher
                value={currentEngine}
                onChange={setCurrentEngine}
                disabled={isGenerating}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── 消息流 ───────────────────────────────── */}
      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
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
              <div key={m.id} id={`msg-${m.id}`}>
                <MessageBubble message={m} engineGradient={meta.gradient} onRemove={handleRemoveMessage} buffering={buffering} />
              </div>
            ))
          )}
          <div ref={messagesEndRef} className="h-2" />
        </div>

        {/* ── 回到最下方按钮（生成期间用户上滑时显示，生成结束后自动消失） ── */}
        {showBackToLatest && (
          <div className="fixed bottom-28 left-1/2 z-20 -translate-x-1/2">
            <button
              type="button"
              onClick={scrollToBottom}
              className="flex items-center gap-2 rounded-full border-2 border-blue-400 bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur transition-all hover:bg-blue-600 active:scale-95 dark:border-blue-600 dark:bg-blue-600"
            >
              <ChevronDown className="h-4 w-4 animate-bounce" />
              回到最新回复
            </button>
          </div>
        )}
      </main>

      {connectionError && (
        <div className="shrink-0 border-t border-red-200 bg-red-50/80 px-4 py-2 text-center text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {connectionError} — 正在尝试重连…
        </div>
      )}

      {/* ── 会话快速跳转导航 ── */}
      <SessionNavigator turns={turns} currentTurn={currentTurn} />

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

function EngineSwitcher({
  value,
  onChange,
  disabled,
}: {
  value: "PI" | "GROK";
  onChange: (v: "PI" | "GROK") => void;
  disabled?: boolean;
}) {
  const OPTIONS: { key: "PI" | "GROK"; label: string; gradient: string }[] = [
    { key: "PI", label: "Pi", gradient: "from-violet-500 to-fuchsia-600" },
    { key: "GROK", label: "Grok", gradient: "from-amber-500 to-orange-600" },
  ];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Cpu className="h-3 w-3 text-muted-foreground" />
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.key)}
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition",
            `bg-gradient-to-r ${opt.gradient}`,
            value === opt.key
              ? "ring-2 ring-offset-1 ring-blue-400 dark:ring-offset-slate-950 text-white"
              : "opacity-50 hover:opacity-80 text-white/80",
            disabled && "pointer-events-none opacity-30",
          )}
          title={`切换引擎：${opt.label}`}
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
