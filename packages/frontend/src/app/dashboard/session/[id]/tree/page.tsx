"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Cpu, GitBranch, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

const ENGINE_COLORS: Record<string, string> = {
  PI: "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/20 dark:text-violet-300",
  GROK: "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-300",
};

const ENGINE_BADGE: Record<string, string> = {
  PI: "bg-gradient-to-r from-violet-500 to-fuchsia-600",
  GROK: "bg-gradient-to-r from-amber-500 to-orange-600",
};

interface TreeNode {
  id: string;
  title: string | null;
  engine: "PI" | "GROK";
  createdAt: string;
  children?: TreeNode[];
}

export default function SessionTreePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id ?? "";
  const token = useAuthStore((s) => s.token);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !token) return;
    fetch(`/api/sessions/${sessionId}/tree`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("加载失败");
        const data = (await res.json()) as { tree: TreeNode };
        setTree(data.tree);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setIsLoading(false));
  }, [sessionId, token]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          正在加载会话树…
        </div>
      </div>
    );
  }

  if (error || !tree) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 px-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">加载失败</p>
          <p className="mt-1 text-sm text-muted-foreground">{error ?? "会话不存在"}</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回工作台
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      {/* 顶栏 */}
      <header className="shrink-0 border-b border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Link href={`/dashboard/session/${sessionId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-foreground">会话树</span>
          </div>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500 truncate">{tree.title ?? "未命名会话"}</span>
        </div>
      </header>

      {/* 树状图 */}
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl">
          <TreeNodeView node={tree} depth={0} />
        </div>
      </main>
    </div>
  );
}

function TreeNodeView({ node, depth }: { node: TreeNode; depth: number }) {
  const colors = ENGINE_COLORS[node.engine];
  const badge = ENGINE_BADGE[node.engine];
  const hasChildren = node.children && node.children.length > 0;
  const date = new Date(node.createdAt).toLocaleString();

  return (
    <div className="relative">
      {/* 节点卡片 */}
      <Link
        href={`/dashboard/session/${node.id}`}
        className={cn(
          "relative flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all hover:shadow-md",
          colors,
          "bg-white/80 dark:bg-slate-900/60",
        )}
      >
        {/* 引擎色条 */}
        <div className={cn("absolute left-0 h-full w-1 rounded-l-lg", badge)} />

        {/* 图标 */}
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br text-white", badge)}>
          <Cpu className="h-3.5 w-3.5" />
        </div>

        {/* 内容 */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{node.title ?? "未命名会话"}</p>
          <p className="text-[10px] opacity-60">{date}</p>
        </div>

        {/* 引擎标签 */}
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white", badge)}>
          {node.engine}
        </span>

        {hasChildren && (
          <span className="flex items-center gap-1 text-[10px] opacity-60">
            <GitBranch className="h-3 w-3" />
            {node.children!.length}
          </span>
        )}
      </Link>

      {/* 子节点 */}
      {hasChildren && (
        <div className="ml-6 mt-2 flex flex-col gap-2 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
          {node.children!.map((child) => (
            <TreeNodeView key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
