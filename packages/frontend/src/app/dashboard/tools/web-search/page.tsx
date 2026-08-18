/**
 * Phase 3 — 联网搜索配置页
 *
 * 路由: /dashboard/tools/web-search
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Globe, Loader2, CheckCircle2, XCircle, Search, ExternalLink,
  AlertCircle, Power, PowerOff, Wrench, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import {
  fetchWebSearchConfig, updateWebSearchConfig, testWebSearch,
  type WebSearchConfig, type WebSearchResult,
} from "@/lib/chat-api";
import { cn } from "@/lib/utils";

export default function WebSearchPage() {
  const token = useAuthStore((s) => s.token);
  const [configs, setConfigs] = useState<WebSearchConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表单
  const [ddgEnabled, setDdgEnabled] = useState(true);
  const [ddgMaxResults, setDdgMaxResults] = useState(5);
  const [serpApiKey, setSerpApiKey] = useState("");
  const [serpMaxResults, setSerpMaxResults] = useState(5);
  const [serpEnabled, setSerpEnabled] = useState(false);

  // 测试搜索
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<WebSearchResult[]>([]);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchWebSearchConfig()
      .then((data) => {
        setConfigs(data);
        const ddg = data.find((c) => c.provider === "duckduckgo");
        if (ddg) {
          setDdgEnabled(ddg.isEnabled);
          setDdgMaxResults(ddg.maxResults);
        }
        const serp = data.find((c) => c.provider === "serpapi");
        if (serp) {
          setSerpEnabled(serp.isEnabled);
          setSerpMaxResults(serp.maxResults);
        }
        setLoading(false);
      })
      .catch(() => { setLoading(false); setError("加载配置失败"); });
  }, [token]);

  const saveDdg = async () => {
    setSaving(true);
    try {
      const config = await updateWebSearchConfig({
        provider: "duckduckgo",
        maxResults: ddgMaxResults,
        isEnabled: ddgEnabled,
      });
      setConfigs((prev) => {
        const rest = prev.filter((c) => c.provider !== "duckduckgo");
        return [...rest, config];
      });
    } catch { /* ignore */ }
    setSaving(false);
  };

  const saveSerp = async () => {
    setSaving(true);
    try {
      const config = await updateWebSearchConfig({
        provider: "serpapi",
        apiKey: serpApiKey || undefined,
        maxResults: serpMaxResults,
        isEnabled: serpEnabled,
      });
      setConfigs((prev) => {
        const rest = prev.filter((c) => c.provider !== "serpapi");
        return [...rest, config];
      });
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!testQuery.trim()) return;
    setTestLoading(true);
    try {
      const results = await testWebSearch(testQuery.trim());
      setTestResults(results);
    } catch { /* ignore */ }
    setTestLoading(false);
  };

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      <header className="shrink-0 border-b border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Link href="/dashboard/tools">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 shadow-sm">
            <Globe className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground">联网搜索</span>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* DuckDuckGo */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 shadow-sm">
                  <Search className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">DuckDuckGo</h3>
                  <p className="text-xs text-slate-500">免费搜索引擎，无需 API Key</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDdgEnabled(!ddgEnabled)}
                className={cn(
                  "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition",
                  ddgEnabled
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                )}
              >
                {ddgEnabled ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                {ddgEnabled ? "已启用" : "已禁用"}
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <label className="text-xs text-slate-500">最大结果数</label>
              <select
                value={ddgMaxResults}
                onChange={(e) => setDdgMaxResults(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {[3, 5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>{n} 条</option>
                ))}
              </select>
              <Button size="sm" onClick={saveDdg} disabled={saving} className="h-7 gap-1 text-xs">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Settings className="h-3 w-3" />}
                保存
              </Button>
            </div>
          </section>

          {/* SerpAPI */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-teal-600 shadow-sm">
                  <Globe className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">SerpAPI</h3>
                  <p className="text-xs text-slate-500">Google 搜索结果，需 API Key</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSerpEnabled(!serpEnabled)}
                className={cn(
                  "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition",
                  serpEnabled
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                )}
              >
                {serpEnabled ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                {serpEnabled ? "已启用" : "已禁用"}
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-500">API Key</label>
                <input
                  type="password"
                  value={serpApiKey}
                  onChange={(e) => setSerpApiKey(e.target.value)}
                  placeholder="输入 SerpAPI Key…"
                  className="mt-1 block w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-500">最大结果数</label>
                <select
                  value={serpMaxResults}
                  onChange={(e) => setSerpMaxResults(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {[3, 5, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>{n} 条</option>
                  ))}
                </select>
                <Button size="sm" onClick={saveSerp} disabled={saving} className="h-7 gap-1 text-xs">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Settings className="h-3 w-3" />}
                  保存
                </Button>
              </div>
            </div>
          </section>

          {/* 测试搜索 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <h3 className="text-sm font-semibold text-foreground">测试搜索</h3>
            <p className="mt-1 text-xs text-slate-500">输入关键词测试搜索功能</p>
            <div className="mt-3 flex gap-2">
              <input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleTest(); }}
                placeholder="输入搜索关键词…"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800"
              />
              <Button onClick={handleTest} disabled={testLoading || !testQuery.trim()} size="sm" className="h-9 gap-1">
                {testLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                搜索
              </Button>
            </div>
            {testResults.length > 0 && (
              <div className="mt-4 space-y-3">
                {testResults.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-800 dark:hover:border-blue-900/30 dark:hover:bg-blue-950/20"
                  >
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{r.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{r.snippet}</p>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                      <ExternalLink className="h-2.5 w-2.5" />
                      {r.url}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}