/**
 * NZi Agent Web — Markdown 渲染组件
 *
 * 使用 react-markdown + remark-gfm + remark-math + rehype-mathjax 渲染 AI 回答，支持：
 * - 标题、列表、引用、代码块、表格等 GFM 语法
 * - 行内代码、加粗、斜体等行内样式
 * - LaTeX 数学公式（$...$ 行内，$$...$$ 块级）
 * - 一键复制按钮（答案气泡内使用）
 */

"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeMathjax from "rehype-mathjax";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface MarkdownProps {
  children: string;
  /** 是否显示一键复制按钮 */
  copyable?: boolean;
  className?: string;
}

/** 轻量代码块渲染器（带语言标签 + 复制按钮） */
function CodeBlock({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const lang = className?.replace(/^language-/, "") ?? "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative my-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-900 text-slate-100 dark:border-slate-700">
      {lang && (
        <div className="flex items-center justify-between border-b border-slate-700 px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400">
          <span>{lang}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          >
            {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      )}
      <pre className="max-h-[400px] overflow-auto p-4 text-xs leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default function Markdown({ children, copyable, className }: MarkdownProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={cn("relative", className)}>
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded px-2 py-1 text-[10px] text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 group-hover:opacity-100"
          title="复制内容"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      )}
      <div className="prose prose-slate prose-p:leading-loose prose-li:leading-relaxed prose-li:my-1.5 prose-headings:mt-5 prose-headings:mb-2.5 prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-h4:text-sm prose-p:my-2.5 prose-ul:my-2.5 prose-ol:my-2.5 prose-blockquote:my-3 prose-blockquote:border-l-4 prose-pre:my-4 prose-pre:border prose-pre:border-slate-200 prose-pre:bg-slate-50 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-slate-800 prose-code:before:content-none prose-code:after:content-none prose-table:my-3 prose-thead:border prose-th:border prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:px-3 prose-td:py-2 prose-hr:my-4 dark:prose-invert dark:prose-pre:border-slate-700 dark:prose-pre:bg-slate-800/50 dark:prose-code:bg-slate-800 dark:prose-code:text-slate-200 dark:prose-th:bg-slate-800/50 max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeMathjax]}
          components={{
            code({ className, children, ...props }) {
              const isBlock = Boolean(className);
              if (isBlock) {
                return (
                  <CodeBlock className={className} {...props}>
                    {String(children).replace(/\n$/, "")}
                  </CodeBlock>
                );
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {children}
        </ReactMarkdown>
      </div>
    </div>
  );
}
