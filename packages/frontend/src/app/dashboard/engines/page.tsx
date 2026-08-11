/**
 * NZi Agent Web — Engine capability page
 *
 * Tells the user what the engine can do today, what Phase 2 will add,
 * and how to wire up a real API key. Mirrors
 * `docs/knowledge/engine-capabilities.md`.
 */

"use client";

import Link from "next/link";
import {
  ArrowLeft, Bot, Brain, Wrench, MessageSquare, Sparkles, Cpu,
  CheckCircle2, XCircle, Clock, ExternalLink, Server, BookOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Capability {
  readonly name: string;
  readonly description: string;
  readonly mock: boolean;
  readonly piPhase1: boolean;
  readonly piPhase2: boolean;
}

const CAPABILITIES: Capability[] = [
  {
    name: "Streaming reply",
    description: "Tokens arrive incrementally instead of waiting for the full answer.",
    mock: true, piPhase1: true, piPhase2: true,
  },
  {
    name: "Thinking timeline",
    description: "Reasoning steps render as foldable cards under the answer.",
    mock: true, piPhase1: true, piPhase2: true,
  },
  {
    name: "Stop / interrupt",
    description: "Abort an in-flight request and persist whatever streamed so far.",
    mock: true, piPhase1: true, piPhase2: true,
  },
  {
    name: "Multi-turn memory",
    description: "Sessions persist across page reloads; previous turns stay in context.",
    mock: false, piPhase1: true, piPhase2: true,
  },
  {
    name: "Tool calls (read / bash / edit)",
    description: "Agent can read files, run shell, edit code, and act on the workspace.",
    mock: false, piPhase1: false, piPhase2: true,
  },
  {
    name: "Session tree (branch / fork)",
    description: "Fork any message into a new branch, then compare two branches side by side.",
    mock: false, piPhase1: false, piPhase2: true,
  },
  {
    name: "Arena (side-by-side)",
    description: "Run two models on the same prompt and compare answers in one view.",
    mock: false, piPhase1: false, piPhase2: true,
  },
  {
    name: "Real-time collaboration",
    description: "Multiple cursors and live presence in the same session.",
    mock: false, piPhase1: false, piPhase2: true,
  },
];

const ENGINES = [
  {
    key: "pi",
    name: "Pi Agent",
    icon: Brain,
    gradient: "from-violet-500 to-fuchsia-600",
    blurb: "默认引擎。走阿里云百炼 OpenAI 兼容接口，支持流式回复、推理时间线、多轮上下文。",
    status: "shipped",
    setup: [
      "在 packages/backend/.env 里设置 BAILIAN_API_KEY（sk-xxx，已 gitignore）。",
      "可选 BAILIAN_MODEL 覆盖模型（默认 qwen-max-2025-01-25）。",
      "可选 BAILIAN_BASE_URL 覆盖端点（默认百炼 compatible-mode/v1）。",
      "重启后端：pnpm --filter backend dev。",
    ],
  },
  {
    key: "mock",
    name: "Mock",
    icon: Sparkles,
    gradient: "from-slate-500 to-slate-700",
    blurb: "打字机兜底引擎，无需 API Key。BAILIAN_API_KEY 缺失时自动接管，适合 UI 调试和演示。",
    status: "shipped",
    setup: [
      "无需配置 —— 已内置。",
      "未配置 BAILIAN_API_KEY 时自动启用。",
      "事件流与真实引擎一致（thinking → tool → answer）。",
    ],
  },
] as const;

function StatusMark({ value }: { value: boolean }) {
  if (value) {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Supported" />;
  }
  return <XCircle className="h-4 w-4 text-slate-300 dark:text-slate-700" aria-label="Not supported" />;
}

function StatusPill({ status }: { status: "shipped" | "phase-1" | "phase-2" }) {
  if (status === "shipped") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Shipped</span>;
  }
  if (status === "phase-1") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Phase 1</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">Phase 2</span>;
}

export default function EnginesPage() {
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
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Agent workbench</p>
            </div>
          </Link>

          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to sessions
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cpu className="h-4 w-4" />
            <span>Engine capabilities</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">What can the engine do?</h1>
          <p className="text-sm text-muted-foreground">
            NZi Agent Web 目前是单引擎架构：Pi Agent（百炼后端）。未配置 API Key 时自动
            回退到 Mock —— UI、时间线、停止按钮在两者之间完全一致。
          </p>
        </div>

        {/* Engine cards */}
        <div className="mb-10 grid gap-4 lg:grid-cols-2">
          {ENGINES.map(({ key, name, icon: Icon, gradient, blurb, status, setup }) => (
            <Card key={key} className="relative overflow-hidden border-slate-200/60 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/80">
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
              <CardHeader className="space-y-2 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} shadow-md`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <StatusPill status={status} />
                </div>
                <CardTitle className="text-lg">{name}</CardTitle>
                <p className="text-xs text-muted-foreground">{blurb}</p>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Setup
                </p>
                <ol className="space-y-1.5 text-xs text-foreground/80">
                  {setup.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Capability matrix */}
        <Card className="border-slate-200/60 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              Capability matrix
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              What each engine can do today, and where Phase 2 lands.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Capability
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Mock
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Pi · P1
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Pi · P2
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CAPABILITIES.map((cap) => (
                    <tr key={cap.name} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-foreground">{cap.name}</p>
                        <p className="text-[11px] text-muted-foreground">{cap.description}</p>
                      </td>
                      <td className="px-2 py-2.5 text-center"><StatusMark value={cap.mock} /></td>
                      <td className="px-2 py-2.5 text-center"><StatusMark value={cap.piPhase1} /></td>
                      <td className="px-2 py-2.5 text-center"><StatusMark value={cap.piPhase2} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Roadmap hints */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card className="border-slate-200/60 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/80">
            <CardContent className="flex flex-col gap-2 py-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Today
              </div>
              <p className="text-sm font-medium text-foreground">Streaming + timeline + stop + 多轮上下文</p>
              <p className="text-xs text-muted-foreground">
                两个引擎渲染同一套三段式时间线：thinking、tool、answer。
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/60 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/80">
            <CardContent className="flex flex-col gap-2 py-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                <MessageSquare className="h-3.5 w-3.5" />
                Phase 2 · Q4 2026
              </div>
              <p className="text-sm font-medium text-foreground">Tools, branching, arena</p>
              <p className="text-xs text-muted-foreground">
                工具注册表（read / bash / edit / write / grep / find / ls）上线；
                会话获得树视图；Arena 让两个模型同题竞技。
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200/60 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/80">
            <CardContent className="flex flex-col gap-2 py-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                <Wrench className="h-3.5 w-3.5" />
                Adding an engine
              </div>
              <p className="text-sm font-medium text-foreground">Implement IEngineAdapter</p>
              <p className="text-xs text-muted-foreground">
                The frontend, WS protocol, timeline, and persistence are engine-agnostic.
                See <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] dark:bg-slate-800">IEngineAdapter</code> in shared-types.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Footer docs link */}
        <div className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          <span>Full setup guide:</span>
          <a
            href="https://github.com/your-org/nzi-agent-web/blob/main/docs/knowledge/pi-agent-setup.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            docs/knowledge/pi-agent-setup.md
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </main>
    </div>
  );
}
