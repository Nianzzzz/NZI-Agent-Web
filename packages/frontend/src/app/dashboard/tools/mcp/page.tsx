/**
 * Phase 3 — MCP 服务器管理
 *
 * 路由: /dashboard/tools/mcp
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plug, Loader2, Plus, X, Check, Trash2,
  Link2, Power, PowerOff, Wrench, Globe, FolderOpen,
  Database, MessageSquare, Search, Terminal, Play, Square,
  AlertCircle, CheckCircle2, RefreshCw, MapPin, Brain, Image,
  GitBranch, Download, FileText, ListChecks, PenTool,
  Container, Server, Cloud, CreditCard, Mail, BookOpen, Monitor,
  Table, CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import {
  fetchMcpServers, fetchMcpPresets, createMcpServer, deleteMcpServer,
  connectMcpServer, disconnectMcpServer,
  type McpServerItem, type McpPreset,
} from "@/lib/chat-api";
import { cn } from "@/lib/utils";

const PRESET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "folder-open": FolderOpen, "github": Globe, "database": Database,
  "message-square": MessageSquare, "search": Search, "globe": Globe, "terminal": Terminal,
  "map-pin": MapPin, "brain": Brain, "image": Image, "git-branch": GitBranch,
  "download": Download, "file-text": FileText, "list-checks": ListChecks,
  "pen-tool": PenTool, "container": Container, "server": Server, "cloud": Cloud,
  "credit-card": CreditCard, "mail": Mail, "book-open": BookOpen, "monitor": Monitor,
  "table": Table, "check-square": CheckSquare,
};

function PresetIcon({ icon, className }: { icon: string; className?: string }) {
  const Comp = PRESET_ICONS[icon] ?? Plug;
  return <Comp className={className} />;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  disconnected: { color: "bg-slate-300", label: "未连接" },
  connecting: { color: "bg-amber-400 animate-pulse", label: "连接中" },
  connected: { color: "bg-emerald-500", label: "已连接" },
  error: { color: "bg-red-500", label: "连接失败" },
};

export default function McpPage() {
  const token = useAuthStore((s) => s.token);
  const [servers, setServers] = useState<McpServerItem[]>([]);
  const [presets, setPresets] = useState<McpPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 添加表单
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "", description: "", transport: "stdio" as const, command: "", url: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  // 已存在的服务器名称集合（用于去重提示）
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMcpServers(),
      fetchMcpPresets(),
    ])
      .then(([s, p]) => { setServers(s); setPresets(p); setLoading(false); setExistingNames(new Set(s.map((sv) => sv.name))); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    reload();
  }, [token, reload]);

  const handleCreate = async () => {
    if (!addForm.name.trim()) return;
    setAddLoading(true);
    try {
      const server = await createMcpServer({
        name: addForm.name.trim(),
        description: addForm.description.trim() || undefined,
        transport: addForm.transport,
        command: addForm.command.trim() || undefined,
        url: addForm.url.trim() || undefined,
      });
      setServers((prev) => [server, ...prev]);
      setExistingNames((prev) => new Set(prev).add(server.name));
      setShowAdd(false);
      setAddForm({ name: "", description: "", transport: "stdio", command: "", url: "" });
    } catch { /* ignore */ }
    setAddLoading(false);
  };

  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      await deleteMcpServer(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleConnect = async (id: string) => {
    setActionLoading(id);
    try {
      const tools = await connectMcpServer(id);
      setServers((prev) => prev.map((s) => s.id === id ? { ...s, status: "connected" as const, tools } : s));
    } catch {
      setServers((prev) => prev.map((s) => s.id === id ? { ...s, status: "error" as const } : s));
    }
    setActionLoading(null);
  };

  const handleDisconnect = async (id: string) => {
    setActionLoading(id);
    try {
      await disconnectMcpServer(id);
      setServers((prev) => prev.map((s) => s.id === id ? { ...s, status: "disconnected" as const, tools: [] } : s));
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      <header className="shrink-0 border-b border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Link href="/dashboard/tools">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
            <Plug className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground">MCP 服务器</span>
          <div className="ml-auto">
            <Button size="sm" onClick={() => setShowAdd(true)} className="h-7 gap-1 text-xs">
              <Plus className="h-3 w-3" />
              添加服务器
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* 预设模板 */}
          <section>
            <h3 className="text-sm font-semibold text-foreground">预设模板</h3>
            <p className="mt-1 text-xs text-slate-500">点击一键添加 30+ 热门 MCP 服务器</p>
            {/* 分类筛选 */}
            {(() => {
              const categories = [...new Set(presets.map((p) => p.category ?? "官方"))];
              return null; // just compute categories
            })()}
            <div className="mt-3 space-y-4">
              {["官方", "社区"].map((cat) => {
                const catPresets = presets.filter((p) => (p.category ?? "官方") === cat);
                if (catPresets.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        cat === "官方"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                      )}>
                        {cat}
                      </span>
                      <span className="text-[10px] text-slate-400">{catPresets.length} 个</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {catPresets.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          disabled={existingNames.has(preset.name)}
                          onClick={async () => {
                            if (existingNames.has(preset.name)) return;
                            try {
                              const server = await createMcpServer({
                                name: preset.name,
                                description: preset.description,
                                transport: preset.transport,
                                command: preset.command,
                                env: preset.env,
                              });
                              setServers((prev) => [server, ...prev]);
                              setExistingNames((prev) => new Set(prev).add(server.name));
                            } catch { /* ignore */ }
                          }}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/60"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
                            <PresetIcon icon={preset.icon} className="h-4 w-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{preset.name}</p>
                            <p className="text-[10px] text-slate-400 line-clamp-1">{preset.description}</p>
                          </div>
                          {existingNames.has(preset.name) ? (
                            <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-500" />
                          ) : (
                            <Plus className="ml-auto h-4 w-4 shrink-0 text-slate-300" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 已添加的服务器 */}
          <section>
            <h3 className="text-sm font-semibold text-foreground">我的服务器</h3>
            {loading ? (
              <div className="mt-3 flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : servers.length === 0 ? (
              <div className="mt-3 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
                <Plug className="h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">暂无 MCP 服务器</p>
                <p className="text-xs text-slate-400">点击上方预设模板一键添加，或手动添加</p>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {servers.map((server) => {
                  const statusConfig = STATUS_CONFIG[server.status];
                  const isActionLoading = actionLoading === server.id;
                  return (
                    <div
                      key={server.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
                            <Plug className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-foreground">{server.name}</h4>
                            <div className="flex items-center gap-1.5">
                              <span className={cn("h-1.5 w-1.5 rounded-full", statusConfig.color)} />
                              <span className="text-[10px] text-slate-400">{statusConfig.label}</span>
                              <span className="text-[10px] text-slate-400">·</span>
                              <span className="text-[10px] text-slate-400">{server.transport}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {server.status === "connected" ? (
                            <button
                              type="button"
                              onClick={() => handleDisconnect(server.id)}
                              disabled={isActionLoading}
                              className="rounded p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-500 dark:hover:bg-amber-950/30"
                              title="断开"
                            >
                              {isActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleConnect(server.id)}
                              disabled={isActionLoading}
                              className="rounded p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-500 dark:hover:bg-emerald-950/30"
                              title="连接"
                            >
                              {isActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(server.id)}
                            disabled={isActionLoading}
                            className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* 工具列表 */}
                      {server.tools.length > 0 && (
                        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                            可用工具 ({server.tools.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {server.tools.map((tool) => (
                              <span
                                key={tool.name}
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                title={tool.description ?? tool.name}
                              >
                                <Wrench className="h-2.5 w-2.5" />
                                {tool.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* 添加服务器 Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">添加 MCP 服务器</h3>
              <button onClick={() => setShowAdd(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">名称</label>
                <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="My MCP Server" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-blue-300 dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">描述</label>
                <input value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} placeholder="可选描述…" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-blue-300 dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">传输方式</label>
                <select value={addForm.transport} onChange={(e) => setAddForm({ ...addForm, transport: e.target.value as "stdio" })} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none dark:border-slate-700 dark:bg-slate-900">
                  <option value="stdio">stdio (命令行)</option>
                  <option value="sse">SSE (Server-Sent Events)</option>
                  <option value="streamable">Streamable HTTP</option>
                </select>
              </div>
              {addForm.transport === "stdio" ? (
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">启动命令</label>
                  <input value={addForm.command} onChange={(e) => setAddForm({ ...addForm, command: e.target.value })} placeholder="npx -y @anthropic/mcp-server-xxx" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-blue-300 dark:border-slate-700 dark:bg-slate-900" />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">URL</label>
                  <input value={addForm.url} onChange={(e) => setAddForm({ ...addForm, url: e.target.value })} placeholder="https://mcp-server.example.com/sse" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-blue-300 dark:border-slate-700 dark:bg-slate-900" />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>取消</Button>
                <Button size="sm" onClick={handleCreate} disabled={addLoading || !addForm.name.trim()}>
                  {addLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  添加
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}