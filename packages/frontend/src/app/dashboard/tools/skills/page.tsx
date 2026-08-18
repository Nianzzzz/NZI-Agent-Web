/**
 * Phase 3 — Skill 市场
 *
 * 路由: /dashboard/tools/skills
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Sparkles, Loader2, Search, Download, Star, Check,
  Plus, X, Code, FileText, BarChart3, Server, Settings, Terminal,
  Shield, Wrench, BookOpen, Regex, Beaker, Trash2, Eye, EyeOff,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import {
  fetchSkills, installSkill, uninstallSkill, toggleSkill, createSkill,
  type SkillItem,
} from "@/lib/chat-api";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "", label: "全部", icon: Sparkles },
  { key: "coding", label: "编程", icon: Code },
  { key: "writing", label: "写作", icon: FileText },
  { key: "analysis", label: "分析", icon: BarChart3 },
  { key: "devops", label: "DevOps", icon: Server },
  { key: "custom", label: "自定义", icon: Settings },
];

const CATEGORY_GRADIENTS: Record<string, string> = {
  coding: "from-blue-500 to-cyan-600",
  writing: "from-violet-500 to-purple-600",
  analysis: "from-amber-500 to-orange-600",
  devops: "from-emerald-500 to-teal-600",
  custom: "from-slate-500 to-slate-700",
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  code: Code, "file-text": FileText, "bar-chart-3": BarChart3,
  server: Server, shield: Shield, wrench: Wrench,
  "book-open": BookOpen, regex: Regex, beaker: Beaker,
  terminal: Terminal, sparkles: Sparkles,
};

function SkillIcon({ icon, className }: { icon: string; className?: string }) {
  const Comp = ICON_MAP[icon] ?? Sparkles;
  return <Comp className={className} />;
}

export default function SkillMarketPage() {
  const token = useAuthStore((s) => s.token);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"popular" | "newest" | "rating">("popular");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 创建 Skill
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "", displayName: "", description: "", category: "coding",
    icon: "sparkles", prompt: "", tags: "", tools: "",
    isPublic: false,
  });
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchSkills({ category: category || undefined, sort, search: search || undefined })
      .then((data) => { setSkills(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, category, sort, search]);

  const handleInstall = async (skillId: string) => {
    setActionLoading(skillId);
    try {
      await installSkill(skillId);
      setSkills((prev) => prev.map((s) => s.id === skillId ? { ...s, isInstalled: true, isEnabled: true, downloads: s.downloads + 1 } : s));
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleUninstall = async (skillId: string) => {
    setActionLoading(skillId);
    try {
      await uninstallSkill(skillId);
      setSkills((prev) => prev.map((s) => s.id === skillId ? { ...s, isInstalled: false, isEnabled: false } : s));
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleToggle = async (skillId: string, enabled: boolean) => {
    setActionLoading(skillId);
    try {
      await toggleSkill(skillId, enabled);
      setSkills((prev) => prev.map((s) => s.id === skillId ? { ...s, isEnabled: enabled } : s));
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.displayName.trim() || !createForm.prompt.trim()) return;
    setCreateLoading(true);
    try {
      const skill = await createSkill({
        name: createForm.name.trim(),
        displayName: createForm.displayName.trim(),
        description: createForm.description.trim(),
        category: createForm.category,
        icon: createForm.icon,
        tags: createForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
        prompt: createForm.prompt.trim(),
        tools: createForm.tools.split(",").map((t) => t.trim()).filter(Boolean),
        isPublic: createForm.isPublic,
      });
      setSkills((prev) => [skill, ...prev]);
      setShowCreate(false);
      setCreateForm({ name: "", displayName: "", description: "", category: "coding", icon: "sparkles", prompt: "", tags: "", tools: "", isPublic: false });
    } catch { /* ignore */ }
    setCreateLoading(false);
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground">Skill 市场</span>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/dashboard/tools/skills/installed">
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                <Download className="h-3 w-3" />
                已安装
              </Button>
            </Link>
            <Button size="sm" onClick={() => setShowCreate(true)} className="h-7 gap-1 text-xs">
              <Plus className="h-3 w-3" />
              创建 Skill
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="mx-auto max-w-5xl space-y-4">
          {/* 搜索 + 排序 */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索 Skill…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "popular" | "newest" | "rating")}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="popular">最受欢迎</option>
              <option value="rating">评分最高</option>
              <option value="newest">最新发布</option>
            </select>
          </div>

          {/* 分类 Tab */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategory(cat.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                  category === cat.key
                    ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400",
                )}
              >
                <cat.icon className="h-3 w-3" />
                {cat.label}
              </button>
            ))}
          </div>

          {/* Skill 列表 */}
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Sparkles className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-500">暂无 Skill</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {skills.map((skill) => {
                const gradient = CATEGORY_GRADIENTS[skill.category] ?? "from-slate-500 to-slate-700";
                const isActionLoading = actionLoading === skill.id;
                return (
                  <div
                    key={skill.id}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
                        gradient,
                      )}>
                        <SkillIcon icon={skill.icon} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="truncate text-sm font-semibold text-foreground">{skill.displayName}</h4>
                          {skill.authorType === "system" && (
                            <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-px text-[9px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">官方</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{skill.description}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                            <Download className="h-2.5 w-2.5" />
                            {skill.downloads}
                          </span>
                          <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                            <Star className="h-2.5 w-2.5" />
                            {skill.rating.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-slate-400">v{skill.version}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                      <div className="flex flex-wrap gap-1">
                        {(skill.tags ?? []).slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        {skill.isInstalled && (
                          <button
                            type="button"
                            onClick={() => handleToggle(skill.id, !skill.isEnabled)}
                            disabled={isActionLoading}
                            className="rounded p-1 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                            title={skill.isEnabled ? "禁用" : "启用"}
                          >
                            {skill.isEnabled ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4" />}
                          </button>
                        )}
                        {skill.isInstalled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUninstall(skill.id)}
                            disabled={isActionLoading}
                            className="h-7 gap-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            卸载
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleInstall(skill.id)}
                            disabled={isActionLoading}
                            className="h-7 gap-1 text-xs"
                          >
                            {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                            安装
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* 创建 Skill Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">创建自定义 Skill</h3>
              <button onClick={() => setShowCreate(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">名称（英文 ID）</label>
                  <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="my-skill" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-blue-300 dark:border-slate-700 dark:bg-slate-900" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">显示名称</label>
                  <input value={createForm.displayName} onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })} placeholder="我的 Skill" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-blue-300 dark:border-slate-700 dark:bg-slate-900" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">描述</label>
                <input value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="简要描述 Skill 的功能…" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-blue-300 dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">分类</label>
                  <select value={createForm.category} onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none dark:border-slate-700 dark:bg-slate-900">
                    {CATEGORIES.filter((c) => c.key !== "").map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">标签（逗号分隔）</label>
                  <input value={createForm.tags} onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })} placeholder="code, review, bug" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-blue-300 dark:border-slate-700 dark:bg-slate-900" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">System Prompt</label>
                <textarea
                  value={createForm.prompt}
                  onChange={(e) => setCreateForm({ ...createForm, prompt: e.target.value })}
                  placeholder="编写 Skill 的系统提示词…"
                  rows={5}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-blue-300 dark:border-slate-700 dark:bg-slate-900 font-mono"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={createForm.isPublic}
                  onChange={(e) => setCreateForm({ ...createForm, isPublic: e.target.checked })}
                  className="rounded"
                />
                <Eye className="h-3 w-3" />
                公开此 Skill（其他用户可见）
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>取消</Button>
                <Button size="sm" onClick={handleCreate} disabled={createLoading || !createForm.name.trim() || !createForm.prompt.trim()}>
                  {createLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  创建
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}