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
  ChevronDown, ChevronRight, Copy, Check, Trash2, Pencil, RefreshCw,
  Paperclip, FolderOpen, X, GitBranch, Vote, Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { useChatSocket } from "@/hooks/use-chat-socket";
import { useChatStore, type ChatMessage } from "@/stores/chat.store";
import { fetchSessionDetail, fetchSessionMessages, deleteMessage, deleteTurn, deleteMessagesFrom, uploadFile, type SessionDetail } from "@/lib/chat-api";
import { useSessionStore } from "@/lib/session-store";
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

/** 格式化字节数为可读字符串 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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

function MessageBubble({ message, engineGradient, onRemove, buffering, onEdit, onRegenerate }: {
  message: ChatMessage;
  engineGradient: string;
  onRemove?: (messageId: string) => void;
  buffering?: boolean;
  onEdit?: (messageId: string, newText: string) => void;
  onRegenerate?: (messageId: string) => void;
}) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const hasNodes = !isUser && message.nodes && message.nodes.length > 0;
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  const handleSaveEdit = () => {
    const text = editText.trim();
    if (!text || !onEdit) { setEditing(false); setEditText(message.content); return; }
    onEdit(message.id, text);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditText(message.content);
  };

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
            editing && onEdit ? (
              <div className="space-y-2">
                <textarea
                  ref={editInputRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                    if (e.key === "Escape") { e.preventDefault(); handleCancelEdit(); }
                  }}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-foreground outline-none ring-2 ring-blue-500/20 dark:bg-slate-900"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="rounded-full bg-blue-500 px-3 py-1 text-[10px] font-semibold text-white hover:bg-blue-600"
                  >
                    确认
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded-full border border-slate-200 px-3 py-1 text-[10px] text-slate-500 hover:bg-slate-50 dark:border-slate-700"
                  >
                    取消
                  </button>
                  <span className="text-[10px] text-slate-400">Enter 确认 · Esc 取消</span>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
            )
          )}
        </div>

        {/* ── 消息操作按钮组（hover 时显示在消息右上角） ── */}
        {(onRemove || onEdit || (!isUser && onRegenerate)) && (
          <div className="absolute -right-2 top-0 z-10 flex flex-col gap-1.5 opacity-0 transition-all group-hover:opacity-100">
            {/* 复制按钮（仅 assistant 完整答案） */}
            {!isUser && message.content && message.status === "completed" && (
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                title="复制内容"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "已复制" : "复制"}
              </button>
            )}
            {/* 编辑按钮（用户消息） */}
            {isUser && onEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 shadow-sm transition-all hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                title="编辑消息"
              >
                <Pencil className="h-3 w-3" />
                编辑
              </button>
            )}
            {/* 重新生成按钮（最后一条 assistant 答案） */}
            {!isUser && onRegenerate && message.status === "completed" && (
              <button
                type="button"
                onClick={() => onRegenerate(message.id)}
                className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 shadow-sm transition-all hover:border-violet-300 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                title="重新生成"
              >
                <RefreshCw className="h-3 w-3" />
                重生成
              </button>
            )}
            {/* 移除按钮（所有消息均可移除） */}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(message.id)}
                className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 shadow-sm transition-all hover:border-amber-300 hover:text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                title="移除整轮对话"
              >
                <Trash2 className="h-3 w-3" />
                移除
              </button>
            )}
          </div>
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

// ─── Arena 会话专用视图：并排双栏，独立滚动 ──────────────────

interface ArenaRound {
  roundIndex: number;
  prompt: ChatMessage | null;
  sideA: ChatMessage | null;
  sideB: ChatMessage | null;
}

/** 将扁平消息列表按轮次分组（user prompt + A/B 回答） */
function groupArenaRounds(messages: ChatMessage[], streaming: ChatMessage | null): ArenaRound[] {
  const rounds: ArenaRound[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      // 去重：跳过与上一轮提问内容相同的重复条目。
      // 旧 DB 数据中同一提问可能被写入两次（后端已修复，此处兼容存量数据）。
      const normalized = m.content.trim();
      const prev = rounds[rounds.length - 1]?.prompt;
      if (prev && prev.content.trim() === normalized) continue;
      rounds.push({ roundIndex: rounds.length, prompt: m, sideA: null, sideB: null });
    } else if (m.arenaSide === "A") {
      const last = rounds[rounds.length - 1];
      if (last) last.sideA = m;
    } else if (m.arenaSide === "B") {
      const last = rounds[rounds.length - 1];
      if (last) last.sideB = m;
    }
  }
  // 将当前 streaming 消息路由到对应侧的最新一轮
  if (streaming) {
    const side = streaming.arenaSide === "A" ? "A" : streaming.arenaSide === "B" ? "B" : null;
    if (side) {
      const last = rounds[rounds.length - 1];
      if (last) {
        if (side === "A") last.sideA = streaming;
        else last.sideB = streaming;
      }
    }
  }
  return rounds;
}

/** Arena 单侧面板（含完整操作按钮） */
function ArenaSidePanel({
  side,
  label,
  provider,
  gradient,
  bgColor,
  message,
  buffering,
  lastMessage,
  onRemove,
  onEdit,
  onRegenerate,
}: {
  side: "A" | "B";
  label: string;
  provider: string;
  gradient: string;
  bgColor: string;
  message: ChatMessage | null;
  buffering: boolean;
  lastMessage: boolean;
  onRemove?: (messageId: string) => void;
  onEdit?: (messageId: string, newText: string) => void;
  onRegenerate?: (messageId: string) => void;
}) {
  const isStreaming = message?.status === "streaming";
  const isCompleted = message?.status === "completed";
  const isError = message?.status === "error";
  const isInterrupted = message?.status === "interrupted";
  const hasNodes = message?.nodes && message.nodes.length > 0;
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message?.content ?? "");
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(false);

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    // 编辑时同步最新内容
    if (message) setEditText(message.content);
  }, [message?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // 流式生成期间自动跟随到底部（仅在该面板内滚动）
  useEffect(() => {
    autoScrollRef.current = isStreaming;
    if (!isStreaming) return;
    let rafId: number;
    const tick = () => {
      if (!autoScrollRef.current) return;
      const el = contentRef.current?.closest("[data-side-scroll]");
      if (el) {
        (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafId); autoScrollRef.current = false; };
  }, [isStreaming]);

  const handleCopy = async () => {
    if (!message?.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleSaveEdit = () => {
    const text = editText.trim();
    if (!text || !onEdit || !message) { setEditing(false); setEditText(message?.content ?? ""); return; }
    onEdit(message.id, text);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditText(message?.content ?? "");
  };

  return (
    <div className={cn("flex w-1/2 flex-col rounded-2xl border min-h-0", bgColor,
      "border-slate-200/60 dark:border-slate-800",
    )}>
      {/* 顶部标签 */}
      <div className="mb-3 flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow bg-gradient-to-br", gradient)}>
            {label}
          </span>
          <span className={cn("rounded-full bg-gradient-to-r px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white", gradient)}>
            {provider}
          </span>
          {isStreaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
          {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          {isError && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
        </div>
        {isCompleted && message?.latencyMs != null && (
          <span className="text-[10px] text-slate-400">{message.latencyMs}ms</span>
        )}
      </div>

      {/* 内容区（独立滚动，占满剩余高度） */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4" data-side-scroll>
        {!message && !isStreaming ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <Bot className="h-6 w-6 opacity-30" />
            <span className="text-xs">等待回答</span>
          </div>
        ) : !message ? null : (
          <div className="flex flex-col gap-3">
            {hasNodes && (
              <div className="rounded-lg border border-slate-200/60 bg-slate-50/70 dark:border-slate-700/50 dark:bg-slate-900/40 p-3">
                <AgentTimeline nodes={message.nodes ?? []} engineGradient="" />
              </div>
            )}
            <div ref={contentRef}>
              {editing && onEdit ? (
                <div className="space-y-2">
                  <textarea
                    ref={editInputRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                      if (e.key === "Escape") { e.preventDefault(); handleCancelEdit(); }
                    }}
                    rows={3}
                    className="w-full resize-y rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-foreground outline-none ring-2 ring-blue-500/20 dark:bg-slate-900"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="rounded-full bg-blue-500 px-3 py-1 text-[10px] font-semibold text-white hover:bg-blue-600"
                    >
                      确认
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="rounded-full border border-slate-200 px-3 py-1 text-[10px] text-slate-500 hover:bg-slate-50 dark:border-slate-700"
                    >
                      取消
                    </button>
                    <span className="text-[10px] text-slate-400">Enter 确认 · Esc 取消</span>
                  </div>
                </div>
              ) : (
                <>
                  {!message.content && !isStreaming ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-400 text-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      思考中…
                    </span>
                  ) : (
                    <>
                      <Markdown>{message.content}</Markdown>
                      {isStreaming && (
                        <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-current align-middle text-slate-400" />
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            {isInterrupted && (
              <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3 w-3" />
                生成已中断
              </p>
            )}
            {isError && (
              <p className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
                <AlertCircle className="h-3 w-3" />
                {message?.content || "出错了"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 操作按钮（hover 显示在右上角） */}
      {(message && (onRemove || onEdit || onRegenerate)) && (
        <div className="absolute -right-2 top-0 z-10 flex flex-col gap-1.5 opacity-0 transition-all group-hover:opacity-100">
          {/* 复制（仅 completed） */}
          {isCompleted && message.content && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              title="复制内容"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {copied ? "已复制" : "复制"}
            </button>
          )}
          {/* 编辑 */}
          {onEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 shadow-sm transition-all hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              title="编辑消息"
            >
              <Pencil className="h-3 w-3" />
              编辑
            </button>
          )}
          {/* 重新生成 */}
          {onRegenerate && isCompleted && lastMessage && (
            <button
              type="button"
              onClick={() => onRegenerate(message.id)}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 shadow-sm transition-all hover:border-violet-300 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              title="重新生成"
            >
              <RefreshCw className="h-3 w-3" />
              重生成
            </button>
          )}
          {/* 移除 */}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(message.id)}
              className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 shadow-sm transition-all hover:border-amber-300 hover:text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              title="移除整轮对话"
            >
              <Trash2 className="h-3 w-3" />
              移除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Arena 单轮视图：共享 prompt + 并排双栏 */
function ArenaRoundRow({
  round,
  buffering,
  onRemoveMessage,
  onEditMessage,
  onRegenerate,
  lastRound,
  renderedMessages,
}: {
  round: ArenaRound;
  buffering: boolean;
  onRemoveMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newText: string) => void;
  onRegenerate?: (messageId: string) => void;
  lastRound: boolean;
  renderedMessages: ChatMessage[];
}) {
  const aStreaming = round.sideA?.status === "streaming";
  const bStreaming = round.sideB?.status === "streaming";

  return (
    <div className={cn("flex flex-col gap-6", lastRound && "flex-1 min-h-0")}>
      {/* 共享用户提问 */}
      {round.prompt && (
        <div className="flex justify-end shrink-0" id={`msg-${round.prompt.id}`}>
          <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-blue-500 to-indigo-600 px-4 py-3 text-sm text-white shadow-sm">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] opacity-70">
              <MessageSquare className="h-3 w-3" />
              <span>第 {round.roundIndex + 1} 轮提问</span>
            </div>
            <div className="whitespace-pre-wrap break-words">{round.prompt.content}</div>
          </div>
        </div>
      )}

      {/* 并排双栏 — 最后一轮 flex-1 撑满剩余高度 */}
      <div className={cn("flex gap-1", lastRound && "flex-1 min-h-0")}>
        {/* Side A — Pi Agent */}
        <div className="group relative flex w-1/2 flex-col min-h-0">
          <ArenaSidePanel
            side="A"
            label="A"
            provider="Pi Agent"
            gradient="from-violet-500 to-fuchsia-600"
            bgColor="bg-violet-50/60 dark:bg-violet-950/15"
            message={round.sideA}
            buffering={buffering}
            lastMessage={lastRound}
            onRemove={onRemoveMessage}
            onEdit={round.prompt ? onEditMessage : undefined}
            onRegenerate={round.sideA ? onRegenerate : undefined}
          />
        </div>

        {/* Side B — Grok Agent */}
        <div className="group relative flex w-1/2 flex-col min-h-0">
          <ArenaSidePanel
            side="B"
            label="B"
            provider="Grok Agent"
            gradient="from-amber-500 to-orange-600"
            bgColor="bg-amber-50/60 dark:bg-amber-950/15"
            message={round.sideB}
            buffering={buffering}
            lastMessage={lastRound}
            onRemove={onRemoveMessage}
            onEdit={round.prompt ? onEditMessage : undefined}
            onRegenerate={round.sideB ? onRegenerate : undefined}
          />
        </div>
      </div>
    </div>
  );
}

/** Arena 会话视图主组件 */
function ArenaSessionView({
  messages,
  streamingMessage,
  buffering,
  onRemoveMessage,
  onEditMessage,
  onRegenerate,
}: {
  messages: ChatMessage[];
  streamingMessage: ChatMessage | null;
  buffering: boolean;
  onRemoveMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newText: string) => void;
  onRegenerate?: (messageId: string) => void;
}) {
  const rounds = useMemo(
    () => groupArenaRounds(messages, streamingMessage),
    [messages, streamingMessage],
  );

  if (rounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-100 dark:from-violet-950/50 dark:to-amber-950/50">
          <Trophy className="h-7 w-7 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Arena 对战会话</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            双引擎并行对比的结果将在这里并排展示。
          </p>
        </div>
      </div>
    );
  }

  const lastIdx = rounds.length - 1;

  return (
    <div className="flex h-full flex-col gap-4 px-2 py-4">
      {rounds.map((round, idx) => {
        const isLast = idx === lastIdx;
        return (
          <div key={round.roundIndex} className={cn("flex flex-col", isLast && "flex-1 min-h-0")}>
            <ArenaRoundRow
              round={round}
              buffering={buffering}
              onRemoveMessage={onRemoveMessage}
              onEditMessage={onEditMessage}
              onRegenerate={onRegenerate}
              lastRound={isLast}
              renderedMessages={messages}
            />
          </div>
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
  // 延迟 WS 连接直到确认会话存在，避免对已删除会话发起无效连接
  const [sessionExists, setSessionExists] = useState(false);
  const [draft, setDraft] = useState("");
  const [thinkingLevel, setThinkingLevel] = useState<"off" | "low" | "medium" | "high">("off");
  const [currentEngine, setCurrentEngine] = useState<"PI" | "GROK">("PI");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [attachments, setAttachments] = useState<Array<{ file: File; url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 防止用户快速连击导致同一条消息被发送两次
  const sendingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // 智能滚动：用户是否主动上滑离开了底部
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  // 生成期间用户上滑过 → 显示"回到最新"按钮；生成结束后自动清除
  const [showBackToLatest, setShowBackToLatest] = useState(false);
  const prevGeneratingRef = useRef(false);

  const replaceMessages = useChatStore((s) => s.replaceMessages);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const rollbackMessages = useChatStore((s) => s.rollbackMessages);
  const updateSessionTitleLocal = useSessionStore((s) => s.updateSessionTitle);

  const {
    connectionStatus,
    connectionError,
    messages,
    streamingMessage,
    isGenerating,
    buffering,
    sendChat,
    stopGeneration,
  } = useChatSocket({ sessionId, token, autoConnect: sessionExists });

  // 移除消息：删除整轮对话（user + assistant），先乐观更新 store，再调用后端 API
  const handleRemoveMessage = useCallback(
    async (messageId: string) => {
      // Arena 模式：只移除当前 assistant 消息（不删除用户提问）
      if (session?.arenaMatchId) {
        removeMessage(sessionId, messageId);
        try {
          await deleteMessage(messageId);
        } catch { /* ignore */ }
        return;
      }
      // 普通模式：乐观删除整轮（user + assistant）
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx >= 0) {
        const target = messages[idx];
        const toRemove = new Set<string>([messageId]);
        if (target.role === "user" && idx + 1 < messages.length && messages[idx + 1].role === "assistant") {
          toRemove.add(messages[idx + 1].id);
        } else if (target.role === "assistant" && idx > 0 && messages[idx - 1].role === "user") {
          toRemove.add(messages[idx - 1].id);
        }
        toRemove.forEach((id) => removeMessage(sessionId, id));
      }
      try {
        await deleteTurn(messageId);
      } catch {
        // 删除失败时不影响已有 UI（消息已从列表中移除）
      }
    },
    [sessionId, removeMessage, messages, session],
  );

  // ─── 加载 session 详情 + 历史消息 ───────────────────────────
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
        setSessionExists(true);
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
            arenaSide: (m as { arenaSide?: string | null }).arenaSide ?? undefined,
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

  // ─── Arena 会话检测 ─────────────────────────────────────────
  const isArenaSession = !!session?.arenaMatchId || renderedMessages.some((m) => m.arenaSide);

  // ─── 自动标题：当会话还是默认标题且有消息时，用首轮提问生成标题 ──
  const { refreshSessions } = useSessionStore();
  useEffect(() => {
    if (!session || renderedMessages.length === 0) return;
    const defaultTitles = ["新会话", "Untitled", "Untitled Session"];
    if (!defaultTitles.includes(session.title ?? "新会话")) return;
    // 取第一条用户消息作为标题
    const firstUserMsg = renderedMessages.find((m) => m.role === "user");
    if (!firstUserMsg) return;
    const title = firstUserMsg.content.trim().slice(0, 30) +
      (firstUserMsg.content.trim().length > 30 ? "…" : "");
    // 乐观更新侧边栏
    updateSessionTitleLocal(session.id, title);
    // 异步调用后端（已有 autoTitle 逻辑，这里只是同步侧边栏）
    refreshSessions().catch(() => {});
  }, [session?.title, renderedMessages.length]);

  // 编辑消息：回滚到该消息处（删除该消息及之后所有消息），更新内容，重新发送
  const handleEditMessage = useCallback(
    async (messageId: string, newText: string) => {
      rollbackMessages(sessionId, messageId);
      try {
        await deleteMessagesFrom(messageId);
      } catch { /* ignore */ }
      sendChat(newText, currentEngine, thinkingLevel, workingDirectory || undefined);
    },
    [sessionId, rollbackMessages, sendChat, currentEngine, thinkingLevel, workingDirectory],
  );

  // 重新生成：回滚到上一条用户消息（删除最后一条 assistant 消息），重新发送
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      const idx = renderedMessages.findIndex((m) => m.id === messageId);
      if (idx <= 0) return;
      let userIdx = idx - 1;
      while (userIdx >= 0 && renderedMessages[userIdx].role !== "user") userIdx--;
      if (userIdx < 0) return;
      const userMsg = renderedMessages[userIdx];
      rollbackMessages(sessionId, userMsg.id);
      try {
        await deleteMessagesFrom(userMsg.id);
      } catch { /* ignore */ }
      sendChat(userMsg.content, currentEngine, thinkingLevel, workingDirectory || undefined);
    },
    [sessionId, rollbackMessages, sendChat, currentEngine, thinkingLevel, renderedMessages, workingDirectory],
  );

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
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
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
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        setUserScrolledUp(false);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = useCallback(() => {
    setUserScrolledUp(false);
    setShowBackToLatest(false);
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  // ─── 发送消息 ────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    if (isGenerating) return;
    // 防重复发送：上一次 sendChat 还未完成（uploading 状态）时忽略
    if (sendingRef.current) return;
    sendingRef.current = true;

    let prompt = text;

    // 上传附件到服务端，将文件路径追加到 prompt 中告知模型
    if (attachments.length > 0) {
      setUploading(true);
      try {
        const uploadedPaths: string[] = [];
        for (const a of attachments) {
          try {
            const result = await uploadFile(sessionId, a.file);
            uploadedPaths.push(result.filePath);
          } catch (err) {
            // 单个文件上传失败不阻断发送，记录到 prompt 中
            uploadedPaths.push(`[上传失败: ${a.file.name}]`);
          }
        }
        const filesNote = uploadedPaths.map((p, i) => {
          const name = attachments[i]?.file.name ?? p;
          return `${name} → ${p}`;
        }).join("; ");
        prompt += `\n\n[已附加文件: ${filesNote}]`;
      } finally {
        setUploading(false);
      }
    }

    sendChat(prompt, currentEngine, thinkingLevel, workingDirectory || undefined);
    setDraft("");
    // 释放 object URL
    attachments.forEach((a) => URL.revokeObjectURL(a.url));
    setAttachments([]);
    // 下一帧释放发送锁，允许再次发送
    requestAnimationFrame(() => { sendingRef.current = false; });
  }, [draft, attachments, isGenerating, sessionId, sendChat, currentEngine, thinkingLevel, workingDirectory]);

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
        // Arena 会话去重：跳过与上一轮内容相同的重复提问（与 groupArenaRounds 逻辑保持一致），
        // 避免右侧快捷跳转导航出现两条相同条目。
        const normalized = m.content.trim();
        const prev = result[result.length - 1];
        if (prev && prev.preview === normalized.slice(0, 60)) continue;
        result.push({
          preview: normalized.slice(0, 60),
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

          {/* 会话树入口 */}
          <Link href={`/dashboard/session/${sessionId}/tree`}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              title="查看会话树"
            >
              <GitBranch className="h-3.5 w-3.5" />
              分支
            </Button>
          </Link>
        </div>
      </header>

      {/* ── 消息流 ───────────────────────────────── */}
      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={cn(
          "flex-1",
          isArenaSession ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {isLoading && renderedMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            正在加载会话…
          </div>
        ) : isArenaSession ? (
          // Arena 会话：并排双栏视图
          <ArenaSessionView
            messages={renderedMessages}
            streamingMessage={streamingMessage}
            buffering={buffering}
            onRemoveMessage={handleRemoveMessage}
            onEditMessage={handleEditMessage}
            onRegenerate={handleRegenerate}
          />
        ) : renderedMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
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
          // 普通会话：单列消息流
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
            {renderedMessages.map((m) => (
              <div key={m.id} id={`msg-${m.id}`}>
                <MessageBubble
                  message={m}
                  engineGradient={meta.gradient}
                  onRemove={handleRemoveMessage}
                  buffering={buffering}
                  onEdit={isUserMessage(m) ? handleEditMessage : undefined}
                  onRegenerate={
                    !isUserMessage(m) && m.status === "completed" && m === renderedMessages[renderedMessages.length - 1]
                      ? handleRegenerate
                      : undefined
                  }
                />
              </div>
            ))}
            <div ref={messagesEndRef} className="h-2" />
          </div>
        )}

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
          {/* ── 附件预览 ── */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  <Paperclip className="h-3 w-3" />
                  {a.file.name}
                  <span className="opacity-60">{formatBytes(a.file.size)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(a.url);
                      setAttachments((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                    className="ml-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800"
                    title="移除附件"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
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
            {/* 上传附件 */}
            <Button
              onClick={() => fileInputRef.current?.click()}
              size="lg"
              variant="outline"
              disabled={connectionStatus !== "connected" && !isGenerating}
              className="h-11 w-11 shrink-0 rounded-2xl p-0 border-slate-200 dark:border-slate-700"
              title="上传文件"
            >
              <Paperclip className="h-4 w-4 text-slate-500" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length === 0) return;
                const newAttachments = files.map((f) => ({
                  file: f,
                  url: URL.createObjectURL(f),
                }));
                setAttachments((prev) => [...prev, ...newAttachments]);
                e.target.value = "";
              }}
            />
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
                disabled={(!draft.trim() && attachments.length === 0) || connectionStatus !== "connected" || uploading}
                className={cn("h-11 w-11 shrink-0 rounded-2xl p-0 bg-gradient-to-br shadow-md", meta.gradient, "hover:opacity-90")}
                title={uploading ? "上传中…" : "发送"}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            )}
          </div>
          {/* ── 工作目录输入 ── */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-muted-foreground transition focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900">
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <input
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                placeholder="工作目录（绝对路径，留空则使用服务端默认目录）"
                className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              {workingDirectory && (
                <button
                  type="button"
                  onClick={() => setWorkingDirectory("")}
                  className="rounded-full hover:text-foreground"
                  title="清除工作目录"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
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
