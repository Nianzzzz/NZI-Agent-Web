/**
 * NZi Agent Web — AgentTimeline
 *
 * T010: 在 assistant 消息气泡下渲染 Agent Loop Timeline。
 *
 * 每个 TimelineNode 是可折叠的卡片，包含：
 * - thinking（灰底 / 可折叠）：内部推理过程
 * - tool（黄色卡片）：工具名 + 参数 + 结果
 * - answer（绿色文本）：最终回答
 *
 * 节点状态：
 * - running → 脉冲动画 + 标题
 * - done → 勾选 + 内容展示
 * - error → 红色 icon + 错误消息
 */

"use client";

import {
  Brain, Wrench, MessageSquare, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Clock, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineNode } from "@/types/chat.types";
import { useState, useMemo } from "react";

export interface AgentTimelineProps {
  nodes: TimelineNode[];
  /** 引擎渐变色 class（用于色调区分） */
  engineGradient: string;
}

const PHASE_LABEL: Record<TimelineNode["type"], string> = {
  thinking: "思考",
  tool: "工具",
  answer: "回答",
};

const PHASE_ICON: Record<TimelineNode["type"], typeof Brain> = {
  thinking: Brain,
  tool: Wrench,
  answer: MessageSquare,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function NodeCard({
  node,
  engineGradient,
}: {
  node: TimelineNode;
  engineGradient: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = node.status === "running";
  const isDone = node.status === "done";
  const isError = node.status === "error";
  const Icon = PHASE_ICON[node.type];

  const bgClass = useMemo(() => {
    if (node.type === "thinking") return "bg-slate-50 border-slate-200 dark:bg-slate-900/50 dark:border-slate-800";
    if (node.type === "tool") return "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40";
    return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40";
  }, [node.type]);

  const hasContent = !!node.delta;
  const canExpand = hasContent && (isDone || isError);

  return (
    <div className={cn("rounded-lg border px-3 py-2 text-sm transition-all", bgClass)}>
      <div className="flex items-center gap-2">
        {/* Status icon */}
        {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
        {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
        {isError && <XCircle className="h-3.5 w-3.5 text-red-500" />}

        {/* Phase icon */}
        <Icon className="h-3.5 w-3.5 text-slate-500" />

        {/* Title */}
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {node.title ?? PHASE_LABEL[node.type]}
        </span>

        {/* Duration */}
        {node.durationMs != null && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <Timer className="h-3 w-3" />
            {formatDuration(node.durationMs)}
          </span>
        )}

        {/* Expand toggle */}
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label={expanded ? "折叠" : "展开"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Tool input hint */}
      {node.type === "tool" && node.toolInput && (
        <div className="mt-1.5 text-[11px] text-slate-500">
          <span className="font-mono bg-slate-200/60 dark:bg-slate-800/60 rounded px-1 py-0.5">
            {JSON.stringify(node.toolInput, null, 0).slice(0, 80)}
          </span>
        </div>
      )}

      {/* Tool output */}
      {node.type === "tool" && node.toolOutput && isDone && (
        <div className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words">
          {node.toolOutput}
        </div>
      )}

      {/* Expanded content */}
      {expanded && node.delta && (
        <div className="mt-2 border-t border-slate-200/60 pt-2 text-xs whitespace-pre-wrap break-words text-slate-600 dark:text-slate-400">
          {node.delta}
        </div>
      )}
    </div>
  );
}

export default function AgentTimeline({
  nodes,
  engineGradient,
}: AgentTimelineProps) {
  if (nodes.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5 border-t border-slate-200/40 pt-2 dark:border-slate-800/40">
      {nodes.map((node) => (
        <NodeCard key={node.id} node={node} engineGradient={engineGradient} />
      ))}
    </div>
  );
}