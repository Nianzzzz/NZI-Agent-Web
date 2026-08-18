/**
 * Phase 3 — 工具中心总览
 *
 * 路由: /dashboard/tools
 */

"use client";

import Link from "next/link";
import {
  Globe, Sparkles, Plug, Wrench, ArrowRight, CheckCircle2, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLS = [
  {
    href: "/dashboard/tools/web-search",
    icon: Globe,
    gradient: "from-blue-500 to-cyan-600",
    bgLight: "bg-blue-50 dark:bg-blue-950/20",
    title: "联网搜索",
    description: "配置搜索引擎，让 Agent 实时搜索互联网获取最新信息",
    features: ["DuckDuckGo 免费接入", "SerpAPI 付费备用", "搜索结果实时展示"],
  },
  {
    href: "/dashboard/tools/skills",
    icon: Sparkles,
    gradient: "from-violet-500 to-purple-600",
    bgLight: "bg-violet-50 dark:bg-violet-950/20",
    title: "Skill 市场",
    description: "浏览、安装、创建 Skill，为 Agent 注入专业能力",
    features: ["10+ 内置 Skill", "一键安装/卸载", "自定义 Skill 创建"],
  },
  {
    href: "/dashboard/tools/mcp",
    icon: Plug,
    gradient: "from-emerald-500 to-teal-600",
    bgLight: "bg-emerald-50 dark:bg-emerald-950/20",
    title: "MCP 服务器",
    description: "连接 MCP 工具服务器，扩展 Agent 的工具调用能力",
    features: ["Filesystem / GitHub / DB", "一键预设模板", "工具自动发现"],
  },
];

export default function ToolsHubPage() {
  return (
    <div className="flex min-h-full flex-col bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      <header className="shrink-0 border-b border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 shadow-sm">
            <Wrench className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground">工具中心</span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">扩展 Agent 的能力边界</span>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className={cn(
                  "absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-10 transition-all group-hover:scale-150 group-hover:opacity-20",
                  tool.bgLight,
                )} />
                <div className="relative space-y-4">
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                    tool.gradient,
                  )}>
                    <tool.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{tool.title}</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tool.description}</p>
                  </div>
                  <ul className="space-y-1.5">
                    {tool.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-slate-500">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-1 text-xs font-medium text-blue-500 opacity-0 transition-opacity group-hover:opacity-100">
                    前往配置
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}