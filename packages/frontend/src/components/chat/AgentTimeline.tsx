/**
 * NZi Agent Web — AgentTimeline
 *
 * 交互设计：
 * - 回答生成中：思考/工具节点自动展开，实时展示推理过程
 * - 回答完成后：推理区域自动折叠，只保留最终答案可见
 * - 用户可随时手动展开/折叠查看推理细节
 * - 答案与推理过程通过分隔线清晰区分
 */

"use client";

import {
  Brain, Wrench, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineNode } from "@/types/chat.types";
import { useState, useEffect, useRef } from "react";

export interface AgentTimelineProps {
  nodes: TimelineNode[];
  /** 引擎渐变色 class */
  engineGradient: string;
}

const THINKING_PREVIEW_MAX = 80;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function nodeSummary(node: TimelineNode): string {
  if (node.type === "tool") {
    return node.title ?? "工具调用";
  }
  const first = (node.delta ?? "").replace(/\s+/g, " ").trim();
  if (!first) return "思考中…";
  return first.length > THINKING_PREVIEW_MAX
    ? first.slice(0, THINKING_PREVIEW_MAX) + "…"
    : first;
}

// ─── 思考/工具折叠节点 ──────────────────────────────────────────

function CollapsibleNode({
  node,
  /** 外层面板是否展开（streaming 中 或 用户手动展开），展开时节点内容也强制展开 */
  parentExpanded,
}: {
  node: TimelineNode;
  parentExpanded: boolean;
}) {
  const isRunning = node.status === "running";
  const isError = node.status === "error";
  // 外层展开中、或本节点仍在 running → 展开内容
  const expanded = parentExpanded || isRunning;

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
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
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
      </div>

      {expanded && (
        <div className="border-t border-current/10 px-2.5 py-2 text-xs">
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
 * AgentTimeline 渲染"推理详情"（思考/工具节点）。
 * 答案（answer）内容由 MessageBubble 通过 message.content 直接渲染，
 * 推理过程在下方以可折叠区域展示，与答案视觉分离。
 *
 * 交互：
 * - streaming 中：自动展开，实时展示推理过程
 * - 完成后：自动折叠，用户可手动展开回顾
 */
export default function AgentTimeline({
  nodes,
}: AgentTimelineProps) {
  const detailNodes = nodes.filter((n) => n.type !== "answer");
  // 任何节点还在 running 状态都视为 streaming 中（思考/工具/回答）
  const isStreaming = nodes.some((n) => n.status === "running");

  // 用户手动控制折叠/展开（仅在非 streaming 时生效）
  const [userExpanded, setUserExpanded] = useState(false);
  // 记录上一次 isStreaming 的值，用于检测 streaming → done 的转换
  const wasStreamingRef = useRef(isStreaming);

  useEffect(() => {
    // streaming 刚结束时，自动折叠
    if (wasStreamingRef.current && !isStreaming) {
      setUserExpanded(false);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  if (detailNodes.length === 0) return null;

  // streaming 中强制展开，否则由用户控制
  const expanded = isStreaming || userExpanded;

  return (
    <div className="mt-3 border-t border-slate-200/40 pt-2.5 dark:border-slate-800/40">
      {/* 可点击的标题栏 */}
      <button
        type="button"
        onClick={() => {
          if (!isStreaming) setUserExpanded((v) => !v);
        }}
        className="flex w-full cursor-pointer select-none items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 transition-transform",
            expanded && "rotate-90",
          )}
        />
        {isStreaming ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
            推理中…
          </span>
        ) : (
          <span>查看推理过程</span>
        )}
        <span className="text-[10px] text-slate-400">
          ({detailNodes.length} 步)
        </span>
      </button>

      {/* 推理节点列表 */}
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {detailNodes.map((node) => (
            <CollapsibleNode
              key={node.id}
              node={node}
              parentExpanded={expanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}
