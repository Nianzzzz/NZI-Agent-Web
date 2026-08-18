/**
 * Phase 3 — 已安装 Skill 管理
 *
 * 路由: /dashboard/tools/skills/installed
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Sparkles, Loader2, Download, Trash2,
  ToggleLeft, ToggleRight, Code, FileText, BarChart3, Server, Settings,
  Shield, Wrench, BookOpen, Regex, Beaker, Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { fetchInstalledSkills, uninstallSkill, toggleSkill, type SkillItem } from "@/lib/chat-api";
import { cn } from "@/lib/utils";

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

export default function InstalledSkillsPage() {
  const token = useAuthStore((s) => s.token);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchInstalledSkills()
      .then((data) => { setSkills(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const handleUninstall = async (skillId: string) => {
    setActionLoading(skillId);
    try {
      await uninstallSkill(skillId);
      setSkills((prev) => prev.filter((s) => s.id !== skillId));
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

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      <header className="shrink-0 border-b border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Link href="/dashboard/tools/skills">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm">
            <Download className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground">已安装的 Skill</span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">{skills.length} 个已安装</span>
          <div className="ml-auto">
            <Link href="/dashboard/tools/skills">
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                <Sparkles className="h-3 w-3" />
                浏览市场
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="mx-auto max-w-5xl">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Download className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-500">暂未安装任何 Skill</p>
              <Link href="/dashboard/tools/skills">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  去 Skill 市场逛逛
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {skills.map((skill) => {
                const gradient = CATEGORY_GRADIENTS[skill.category] ?? "from-slate-500 to-slate-700";
                const isActionLoading = actionLoading === skill.id;
                return (
                  <div
                    key={skill.id}
                    className={cn(
                      "flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900/60",
                      !skill.isEnabled && "opacity-60",
                    )}
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
                          <span className={cn(
                            "shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium",
                            skill.isEnabled
                              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                          )}>
                            {skill.isEnabled ? "启用中" : "已禁用"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{skill.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400">v{skill.version} · {skill.authorType === "system" ? "官方" : "用户"}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggle(skill.id, !skill.isEnabled)}
                          disabled={isActionLoading}
                          className="rounded p-1 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                          title={skill.isEnabled ? "禁用" : "启用"}
                        >
                          {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : skill.isEnabled ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4" />}
                        </button>
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
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}