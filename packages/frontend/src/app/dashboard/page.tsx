"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  Bot, Plus, MessageSquare, LogOut, User as UserIcon, Sparkles,
  Trash2, Clock, Cpu, Inbox, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { useSessionStore } from "@/lib/session-store";

const ENGINE_LABELS: Record<string, string> = {
  PI: "Pi Agent",
  GROK: "Grok Agent",
};

const ENGINE_GRADIENTS: Record<string, string> = {
  PI: "from-violet-500 to-fuchsia-600",
  GROK: "from-amber-500 to-orange-600",
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { sessions, isLoading, error, fetchSessions, createSession, removeSession } = useSessionStore();

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleNewSession = async () => {
    try {
      await createSession({ title: `New session ${new Date().toLocaleTimeString()}` });
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      <header className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/30">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight text-foreground">NZi Agent</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Multi-engine workbench</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900 sm:flex">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-semibold text-white">
                {user?.displayName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
              </div>
              <span className="text-sm font-medium text-foreground">
                {user?.displayName ?? user?.email ?? "User"}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>Welcome back, {user?.displayName ?? "there"}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Your sessions</h1>
          <p className="text-sm text-muted-foreground">
            Manage and continue conversations across Pi Agent and Grok Agent engines.
          </p>
        </div>

        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cpu className="h-4 w-4" />
            <span>{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/dashboard/engines">
                <BookOpen className="h-4 w-4" />
                Engine capabilities
              </Link>
            </Button>
            <Button onClick={handleNewSession} disabled={isLoading} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Session
            </Button>
          </div>
        </div>

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/30">
            <CardContent className="flex items-center gap-3 py-4 text-sm text-red-700 dark:text-red-300">
              <Inbox className="h-4 w-4" />
              {error}
            </CardContent>
          </Card>
        )}

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

        {!isLoading && sessions.length === 0 && !error && (
          <Card className="border-dashed bg-white/50 dark:bg-slate-950/30">
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-950/50 dark:to-indigo-950/50">
                <MessageSquare className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">No sessions yet</h3>
                <p className="text-sm text-muted-foreground">
                  Create your first session to get started with NZi Agent.
                </p>
              </div>
              <Button onClick={handleNewSession} className="gap-1.5">
                <Plus className="h-4 w-4" />
                New Session
              </Button>
            </CardContent>
          </Card>
        )}

        {sessions.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => (
              <Card
                key={session.id}
                className="group relative overflow-hidden border-slate-200/60 bg-white/80 transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/10 dark:border-slate-800/60 dark:bg-slate-900/80 dark:hover:border-blue-700"
              >
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${ENGINE_GRADIENTS[session.engine ?? "PI"]}`} />

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
                      <Link href={`/dashboard/session/${session.id}`}>
                        <MessageSquare className="h-3.5 w-3.5" />
                        Open
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-600"
                      onClick={() => removeSession(session.id)}
                      title="Delete (UI only)"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <UserIcon className="h-3.5 w-3.5" />
          Logged in as <span className="font-medium text-foreground">{user?.email}</span>
        </div>
      </main>
    </div>
  );
}
