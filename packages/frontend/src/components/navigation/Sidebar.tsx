/**
 * NZi Agent Web — 左侧导航栏
 *
 * 功能：
 * - 固定宽度左侧边栏（240px），移动端自动折叠为抽屉
 * - 会话列表（活跃态高亮、hover 显示删除按钮）
 * - 新建会话、重命名会话（双击标题）
 * - 底部用户信息 + 退出登录
 */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";import {
  Bot, Plus, LogOut, MoreHorizontal, Pencil, Trash2,
  Check, X, MessageSquare, ChevronLeft, ChevronRight,
  Cpu, Sparkles, Trophy, History, Wrench, Globe, Plug,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { useSessionStore, type Session } from "@/lib/session-store";
import { cn } from "@/lib/utils";

const ENGINE_GRADIENTS: Record<string, string> = {
  PI: "from-violet-500 to-fuchsia-600",
  GROK: "from-amber-500 to-orange-600",
};

const ENGINE_LABELS: Record<string, string> = {
  PI: "Pi",
  GROK: "Grok",
};

interface SidebarProps {
  /** 侧边栏是否折叠（移动端或用户手动收起） */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ collapsed: collapsedProp = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(collapsedProp);

  // 同步外部 collapsed 变化
  useEffect(() => { setCollapsed(collapsedProp); }, [collapsedProp]);

  // 监听 body 上的 sidebar-collapsed 类，用于跨组件同步
  useEffect(() => {
    const check = () => {
      const isCollapsed = document.body.classList.contains("sidebar-collapsed");
      setCollapsed(isCollapsed);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const handleToggle = () => {
    const next = !collapsed;
    document.body.classList.toggle("sidebar-collapsed", next);
    setCollapsed(next);
    onToggleCollapse?.();
  };
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { sessions, isLoading, fetchSessions, createSession, removeSession, renameSession } =
    useSessionStore();

  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // 双击标题进入重命名
  const startRename = (session: Session) => {
    setIsRenaming(session.id);
    setRenameDraft(session.title ?? "Untitled");
    requestAnimationFrame(() => renameInputRef.current?.focus());
  };

  const commitRename = async (id: string) => {
    const title = renameDraft.trim();
    if (title) {
      await renameSession(id, title);
    }
    setIsRenaming(null);
  };

  const cancelRename = () => {
    setIsRenaming(null);
    setRenameDraft("");
  };

  const handleNewSession = async () => {
    const session = await createSession({ title: undefined });
    // 导航到新会话
    window.location.href = `/dashboard/session/${session.id}`;
  };

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  const isActive = (id: string) => pathname === `/dashboard/session/${id}`;

  // ─── 移动端抽屉覆盖层 ─────────────────────────────────────
  const MobileOverlay = () => (
    <>
      {/* 遮罩 */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden",
          isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setIsMobileOpen(false)}
      />
      {/* 移动端打开按钮 */}
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white/90 text-slate-600 shadow-sm backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300"
        title="打开侧边栏"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {/* 移动端侧边栏容器（滑入） */}
      <div
        className={cn(
          "fixed left-0 top-0 z-40 h-full w-64 transform border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-in-out lg:hidden dark:border-slate-800 dark:bg-slate-950",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarInner
          sessions={sessions}
          isLoading={isLoading}
          isRenaming={isRenaming}
          renameDraft={renameDraft}
          setRenameDraft={setRenameDraft}
          renameInputRef={renameInputRef}
          isActive={isActive}
          startRename={startRename}
          commitRename={commitRename}
          cancelRename={cancelRename}
          handleNewSession={handleNewSession}
          removeSession={removeSession}
          renameSession={renameSession}
          user={user}
          handleLogout={handleLogout}
          collapsed={false}
          onToggleCollapse={undefined}
          handleToggle={handleToggle}
          currentPath={pathname}
        />
      </div>
    </>
  );

  return (
    <>
      <MobileOverlay />
      {/* 桌面端固定侧边栏 */}
      <aside
        className={cn(
          "hidden h-screen flex-col border-r border-slate-200/60 bg-white/70 backdrop-blur-md lg:flex dark:border-slate-800/60 dark:bg-slate-950/70",
          collapsed ? "w-14 items-center" : "w-60",
        )}
      >
        <SidebarInner
          sessions={sessions}
          isLoading={isLoading}
          isRenaming={isRenaming}
          renameDraft={renameDraft}
          setRenameDraft={setRenameDraft}
          renameInputRef={renameInputRef}
          isActive={isActive}
          startRename={startRename}
          commitRename={commitRename}
          cancelRename={cancelRename}
          handleNewSession={handleNewSession}
          removeSession={removeSession}
          renameSession={renameSession}
          user={user}
          handleLogout={handleLogout}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          handleToggle={handleToggle}
          currentPath={pathname}
        />
      </aside>
    </>
  );
}

// ─── 侧边栏内部（桌面/移动共用） ───────────────────────────────

function SidebarInner({
  sessions,
  isLoading,
  isRenaming,
  renameDraft,
  setRenameDraft,
  renameInputRef,
  isActive,
  startRename,
  commitRename,
  cancelRename,
  handleNewSession,
  removeSession,
  renameSession: _renameSession,
  user,
  handleLogout,
  collapsed,
  onToggleCollapse,
  handleToggle,
  currentPath,
}: {
  sessions: Session[];
  isLoading: boolean;
  isRenaming: string | null;
  renameDraft: string;
  setRenameDraft: (v: string) => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  isActive: (id: string) => boolean;
  startRename: (s: Session) => void;
  commitRename: (id: string) => Promise<void>;
  cancelRename: () => void;
  handleNewSession: () => void;
  removeSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  user: { email?: string | null; displayName?: string | null } | null;
  handleLogout: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  handleToggle?: () => void;
  currentPath: string;
}) {
  const isDashboard = currentPath === "/dashboard";

  return (
    <>
      {/* ── 顶部：Logo + 折叠按钮 ── */}
      <div className={cn("flex h-14 items-center justify-between px-3", collapsed && "justify-center px-0")}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground">NZi Agent</span>
          </Link>
        )}
        {collapsed && (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
            <Bot className="h-4 w-4 text-white" />
          </div>
        )}
        <button
            type="button"
            onClick={onToggleCollapse ?? handleToggle}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
      </div>

      {/* ── 新建会话按钮 ── */}
      <div className={cn("px-2 py-2", collapsed && "px-1")}>
        <button
          type="button"
          onClick={handleNewSession}
          disabled={isLoading}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/30",
            collapsed && "justify-center px-2",
          )}
          title={collapsed ? "新建会话" : ""}
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!collapsed && "新建会话"}
        </button>
      </div>

      {/* ── 会话列表 ── */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {!collapsed && (
          <div className="mb-2 flex items-center gap-1.5 px-2 text-[10px] uppercase tracking-wider text-slate-400">
            <Sparkles className="h-3 w-3" />
            会话
          </div>
        )}

        {isLoading && sessions.length === 0 ? (
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <MessageSquare className="h-4 w-4 text-slate-400" />
            </div>
            {!collapsed && <p className="text-xs text-slate-400">暂无会话</p>}
          </div>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((session) => {
              const active = isActive(session.id);
              const renaming = isRenaming === session.id;
              const gradient = ENGINE_GRADIENTS[session.engine ?? "PI"];

              return (
                <div
                  key={session.id}
                  className={cn(
                    "group relative flex items-center rounded-lg transition-colors",
                    active
                      ? "bg-slate-100 dark:bg-slate-800"
                      : "hover:bg-slate-50 dark:hover:bg-slate-900/50",
                  )}
                >
                  {/* 左侧引擎色条 */}
                  <div className={cn("absolute left-0 h-full w-0.5 rounded-full bg-gradient-to-b", gradient)} />

                  {renaming ? (
                    <form
                      className="flex flex-1 items-center gap-1 px-2 py-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void commitRename(session.id);
                      }}
                    >
                      <input
                        ref={renameInputRef}
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => void commitRename(session.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelRename();
                        }}
                        className="flex-1 rounded bg-transparent px-1 text-sm text-foreground outline-none ring-1 ring-blue-400 dark:bg-slate-800"
                      />
                      <button
                        type="submit"
                        className="rounded p-0.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        title="确认"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="取消"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <Link
                      href={`/dashboard/session/${session.id}`}
                      className={cn(
                        "flex min-h-8 flex-1 items-center gap-2 overflow-hidden px-2 py-1.5 text-sm",
                        active ? "font-medium text-foreground" : "text-slate-500 dark:text-slate-400",
                        collapsed && "justify-center px-1",
                      )}
                      title={session.title ?? "Untitled"}
                    >
                      <Cpu className={cn("h-3.5 w-3.5 shrink-0", active ? "text-blue-500" : "text-slate-400")} />
                      {!collapsed && (
                        <span className="min-w-0 flex-1 truncate">{session.title ?? "Untitled"}</span>
                      )}
                      {!collapsed && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white",
                            gradient,
                          )}
                        >
                          {ENGINE_LABELS[session.engine ?? "PI"]}
                        </span>
                      )}
                    </Link>
                  )}

                  {/* 操作按钮（hover 显示） */}
                  {!renaming && !collapsed && (
                    <div className="absolute right-1 hidden items-center gap-0.5 group-hover:flex">
                      <button
                        type="button"
                        onClick={() => startRename(session)}
                        className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                        title="重命名"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await removeSession(session.id);
                        }}
                        className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                        title="删除会话"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 底部：Arena 入口 + 工具中心 + 用户信息 + 退出 ── */}
      <div className={cn("border-t border-slate-200/60 px-2 py-2 dark:border-slate-800/60", collapsed && "px-1")}>
        {!collapsed && (
          <div className="mb-2 flex items-center gap-1.5 px-2 text-[10px] uppercase tracking-wider text-slate-400">
            <Trophy className="h-3 w-3" />
            Arena
          </div>
        )}
        {!collapsed && (
          <Link
            href="/dashboard/arena"
            className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/20"
          >
            <Trophy className="h-4 w-4 shrink-0" />
            <span className="font-medium">Arena 对战</span>
          </Link>
        )}
        {!collapsed && (
          <Link
            href="/dashboard/arena/history"
            className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-950/20"
          >
            <History className="h-4 w-4 shrink-0" />
            <span className="font-medium">对战历史</span>
          </Link>
        )}
        {/* Tools */}
        {!collapsed && (
          <div className="mb-2 mt-2 flex items-center gap-1.5 px-2 text-[10px] uppercase tracking-wider text-slate-400">
            <Wrench className="h-3 w-3" />
            工具
          </div>
        )}
        {!collapsed && (
          <Link
            href="/dashboard/tools"
            className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-900/50 dark:hover:text-slate-300"
          >
            <Wrench className="h-4 w-4 shrink-0" />
            <span className="font-medium">工具中心</span>
          </Link>
        )}
        {!collapsed && (
          <Link
            href="/dashboard/tools/web-search"
            className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20"
          >
            <Globe className="h-4 w-4 shrink-0" />
            <span className="font-medium">联网搜索</span>
          </Link>
        )}
        {!collapsed && (
          <Link
            href="/dashboard/tools/skills"
            className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-950/20"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="font-medium">Skill 市场</span>
          </Link>
        )}
        {!collapsed && (
          <Link
            href="/dashboard/tools/mcp"
            className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/20"
          >
            <Plug className="h-4 w-4 shrink-0" />
            <span className="font-medium">MCP 服务器</span>
          </Link>
        )}
        {!collapsed && user && (
          <div className="mb-2 flex items-center gap-2 px-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-semibold text-white">
              {user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {user.displayName ?? user.email}
              </p>
              <p className="truncate text-[10px] text-slate-400">{user.email}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/20",
            collapsed && "justify-center px-1",
          )}
          title="退出登录"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "退出登录"}
        </button>
      </div>
    </>
  );
}
