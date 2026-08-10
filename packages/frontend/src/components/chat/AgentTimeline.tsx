/**
 * NZi Agent Web — AgentTimeline
 *
 * T010 + Phase 2 polish:
 * - 答案（answer）节点永远展开显示，是消息的核心内容
 * - 思考（thinking）和工具（tool）节点放在底部作为"推理细节"，
 *   默认折叠成一行摘要（思考 1 行 / 工具名+时长），点击展开
 * - 思考节点在 streaming 时也可见（实时显示已生成的内容）
 */

"use client";

import {
  Brain, Wrench, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineNode } from "@/types/chat.types";
import { useState, useEffect } from "react";

export interface AgentTimelineProps {
  nodes: TimelineNode[];
  /** 引擎渐变色 class */
  engineGradient: string;
}

const THINKING_PREVIEW_MAX = 80;  // 折叠时显示前 80 字

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 节点摘要（一行） */
function nodeSummary(node: TimelineNode): string {
  if (node.type === "tool") {
    return node.title ?? "工具调用";
  }
  // thinking
  const first = (node.delta ?? "").replace(/\s+/g, " ").trim();
  if (!first) return "思考中…";
  return first.length > THINKING_PREVIEW_MAX
    ? first.slice(0, THINKING_PREVIEW_MAX) + "…"
    : first;
}

// ─── 思考/工具折叠节点 ──────────────────────────────────────────

function CollapsibleNode({
  node,
  defaultExpanded = false,
}: {
  node: TimelineNode;
  defaultExpanded?: boolean;
}) {
  const isRunning = node.status === "running";
  const isError = node.status === "error";
  // running 状态自动展开
  const [expanded, setExpanded] = useState(isRunning || defaultExpanded);

  useEffect(() => {
    if (isRunning) setExpanded(true);
  }, [isRunning]);

  const Icon = node.type === "tool" ? Wrench : Brain;
  const labelColor = node.type === "tool"
    ? "text-amber-700 dark:text-amber-300"
    : "text-slate-600 dark:text-slate-300";
  const borderColor = node.type === "tool"
    ? "border-amber-200/60 dark:border-amber-800/30"
    : "border-slate-200/60 dark:border-slate-700/40";
  const bgColor = node.type === "tool"
    ? "bg-amber-50/40 dark:bg-amber-950/10"
    : "bg-slate-50/60 dark:bg-slate-900/30";

  return (
    <div className={cn("rounded-md border", borderColor, bgColor)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      >
        {/* 状态指示 */}
        {isRunning ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" />
        ) : isError ? (
          <XCircle className="h-3 w-3 shrink-0 text-red-500" />
        ) : (
          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
        )}

        {/* 阶段图标 + 标签 */}
        <Icon className={cn("h-3 w-3 shrink-0", labelColor)} />
        <span className={cn("shrink-0 font-medium", labelColor)}>
          {node.type === "tool" ? "工具" : "思考"}
        </span>

        {/* 摘要 */}
        <span className="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400">
          {nodeSummary(node)}
        </span>

        {/* 时长 */}
        {node.durationMs != null && !isRunning && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-slate-400">
            <Timer className="h-2.5 w-2.5" />
            {formatDuration(node.durationMs)}
          </span>
        )}

        {/* 展开/折叠 */}
        <span className="shrink-0 text-slate-400">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-current/10 px-2.5 py-2 text-xs">
          {/* 工具节点：输入 + 输出 */}
          {node.type === "tool" && (
            <>
              {node.toolInput && (
                <div className="mb-1.5">
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    输入
                  </div>
                  <pre className="overflow-x-auto rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    {JSON.stringify(node.toolInput, null, 2)}
                  </pre>
                </div>
              )}
              {node.toolOutput && (
                <div>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    输出
                  </div>
                  <div className="whitespace-pre-wrap break-words rounded bg-slate-100 px-2 py-1 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    {node.toolOutput}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 思考节点：完整内容 */}
          {node.type === "thinking" && node.delta && (
            <div className="whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300">
              {node.delta}
            </div>
          )}
          {node.type === "thinking" && isRunning && !node.delta && (
            <div className="flex items-center gap-1.5 text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              正在思考…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 顶层渲染 ───────────────────────────────────────────────────

/**
 * AgentTimeline 只渲染"推理详情"（思考/工具节点）。
 * 答案（answer）节点的内容由 MessageBubble 通过 message.content 直接渲染，
 * 避免在同一气泡里重复显示两份答案。
 *
 * 整体外层是一个 <details>，默认折叠；用户在生成时可点开查看推理步骤。
 */
export default function AgentTimeline({
  nodes,
}: AgentTimelineProps) {
  const detailNodes = nodes.filter((n) => n.type !== "answer");
  // 还有 answer 节点在 streaming → 自动展开（让用户看到推理过程）
  const isStreaming = nodes.some((n) => n.type === "answer" && n.status === "running");

  if (detailNodes.length === 0) return null;

  return (
    <div className="mt-3 border-t border-slate-200/40 pt-2.5 dark:border-slate-800/40">
      <details className="group" open={isStreaming}>
        <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
          <span>查看推理过程</span>
          <span className="text-[10px] text-slate-400">
            ({detailNodes.length} 步)
          </span>
        </summary>
        <div className="mt-1.5 space-y-1">
          {detailNodes.map((node) => (
            <CollapsibleNode
              key={node.id}
              node={node}
              defaultExpanded={isStreaming}
            />
          ))}
        </div>
      </details>
    </div>
  );
}
