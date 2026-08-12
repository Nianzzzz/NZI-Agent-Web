"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  Bot, Plus, MessageSquare, Trash2, Clock, Cpu, Inbox,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { useSessionStore } from "@/lib/session-store";

const ENGINE_GRADIENTS: Record<string, string> = {
  PI: "from-violet-500 to-fuchsia-600",
  GROK: "from-amber-500 to-orange-600",
};

const ENGINE_LABELS: Record<string, string> = {
  PI: "Pi Agent",
  GROK: "Grok Agent",
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { sessions, isLoading, error, fetchSessions, createSession, removeSession } = useSessionStore();

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleNewSession = async () => {
    try {
      const session = await createSession({ title: undefined });
      window.location.href = `/dashboard/session/${session.id}`;
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* ── 欢迎区 ── */}
      <div className="mb-8 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>欢迎回来，{user?.displayName ?? user?.email ?? "你好"}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">你的会话</h1>
        <p className="text-sm text-muted-foreground">
          管理并继续与 Pi Agent 和 Grok Agent 的对话。
        </p>
      </div>

      {/* ── 操作栏 ── */}
      <div className="mb-6 flex items-center justify-end gap-3">
        <Button onClick={handleNewSession} disabled={isLoading} className="gap-1.5">
          <Plus className="h-4 w-4" />
          新建会话
        </Button>
      </div>

      {/* ── 错误提示 ── */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/30">
          <CardContent className="flex items-center gap-3 py-4 text-sm text-red-700 dark:text-red-300">
            <Inbox className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* ── 加载骨架 ── */}
      {isLoading && sessions.length === 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="space-y-3 py-6">
                <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── 空状态 ── */}
      {!isLoading && sessions.length === 0 && !error && (
        <Card className="border-dashed bg-white/50 dark:bg-slate-950/30">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-950/50 dark:to-indigo-950/50">
              <MessageSquare className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">还没有会话</h3>
              <p className="text-sm text-muted-foreground">
                创建你的第一个会话，开始与 NZi Agent 对话。
              </p>
            </div>
            <Button onClick={handleNewSession} className="gap-1.5">
              <Plus className="h-4 w-4" />
              新建会话
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── 会话卡片网格 ── */}
      {sessions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <Card
              key={session.id}
              className="group relative overflow-hidden border-slate-200/60 bg-white/80 transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/10 dark:border-slate-800/60 dark:bg-slate-900/80 dark:hover:border-blue-700"
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${ENGINE_GRADIENTS[session.engine ?? "PI"]}`}
              />

              <CardContent className="space-y-3 pt-5">
                <Link href={`/dashboard/session/${session.id}`} className="block space-y-2">
                  <h3 className="line-clamp-1 text-base font-semibold text-foreground group-hover:text-blue-600">
                    {session.title || "Untitled session"}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white ${ENGINE_GRADIENTS[session.engine ?? "PI"]}`}
                    >
                      <Cpu className="h-2.5 w-2.5" />
                      {ENGINE_LABELS[session.engine ?? "PI"]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(session.createdAt).toLocaleString()}
                  </div>
                </Link>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-blue-600"
                  >
                    <Link href={`/dashboard/session/${session.id}`}>打开</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    onClick={() => removeSession(session.id)}
                    title="删除会话"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── 底部信息 ── */}
      <div className="mt-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Bot className="h-3.5 w-3.5" />
        已登录为 <span className="font-medium text-foreground">{user?.email}</span>
      </div>
    </div>
  );
}
