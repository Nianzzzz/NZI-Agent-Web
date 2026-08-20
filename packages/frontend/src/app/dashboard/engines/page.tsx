/**
 * NZi Agent Web — Engine 配置页
 *
 * 路由: /dashboard/engines
 *
 * 功能：
 * - 查看当前引擎配置（模型、推理级别、启用状态）
 * - 切换模型（带免费额度过期时间提示）
 * - 配置推理级别（off / low / medium / high）
 * - 启用 / 禁用引擎
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bot, Brain, Cpu, Settings, Loader2, CheckCircle2,
  AlertCircle, RefreshCw, Sparkles, ChevronDown, Calendar,
  TrendingUp, Zap, Shield, Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { fetchEngineConfigs, updateEngineConfig, type EngineConfigItem } from "@/lib/chat-api";
import { cn } from "@/lib/utils";

// ─── 模型列表（含免费额度过期时间）────────────────────────────────────
// 数据来源：百炼控制台 → 全部模型 → 免费额度剩余量
// 过期后需切换到其他可用模型。更新时间：2026-08-18
export interface ModelInfo {
  id: string;
  name: string;
  /** 免费额度剩余量（百万 tokens） */
  quota: number;
  /** 过期时间（ISO date） */
  expiresAt: string;
  /** 推荐标签 */
  badge?: "推荐" | "快速" | "开源" | "均衡" | "已过期";
  badgeColor?: "emerald" | "blue" | "violet" | "amber" | "red";
}

const MODELS: ModelInfo[] = [
  { id: "qwen3.8-max", name: "Qwen3.8-Max", quota: 1_000_000, expiresAt: "2026-11-01", badge: "推荐", badgeColor: "emerald" },
  { id: "qwen3.7-plus", name: "Qwen3.7-Plus", quota: 1_000_000, expiresAt: "2026-09-01", badge: "均衡", badgeColor: "blue" },
  { id: "qwen3.7-flash", name: "Qwen3.7-Flash", quota: 1_000_000, expiresAt: "2026-10-23", badge: "快速", badgeColor: "violet" },
  { id: "qwen3.8-27b", name: "Qwen3.8-27B", quota: 1_000_000, expiresAt: "2026-11-18", badge: "开源", badgeColor: "amber" },
  { id: "qwen3.7-flash-2026-07-15", name: "Qwen3.7-Flash (0715)", quota: 1_000_000, expiresAt: "2026-10-23" },
  { id: "qwen3.5-ocr", name: "Qwen3.5-OCR", quota: 1_000_000, expiresAt: "2026-09-14" },
  { id: "qwen3.7-max-2026-06-08", name: "Qwen3.7-Max (0608)", quota: 1_000_000, expiresAt: "2026-09-08" },
  { id: "qwen3.7-max-2026-05-17", name: "Qwen3.7-Max (0517)", quota: 1_000_000, expiresAt: "2026-08-24" },
  { id: "qwen3.7-plus-2026-05-26", name: "Qwen3.7-Plus (0526)", quota: 979_568, expiresAt: "2026-09-01" },
  { id: "qwen3.8-2.4t-a95b", name: "Qwen3.8-2.4T-A95B", quota: 1_000_000, expiresAt: "2026-11-12" },
  { id: "deepseek-v4-flash-0731", name: "DeepSeek-V4-Flash", quota: 1_000_000, expiresAt: "2026-10-31" },
  { id: "deepseek-v4-pro-0813", name: "DeepSeek-V4-Pro", quota: 1_000_000, expiresAt: "2026-11-13" },
  { id: "kimi-k2.7-code", name: "Kimi-K2.7-Code", quota: 1_000_000, expiresAt: "2026-09-14" },
  { id: "glm-5.2", name: "GLM-5.2", quota: 1_000_000, expiresAt: "2026-09-15" },
];

// ⚠️ 已过期模型（2026/08/24 到期）—— 展示在列表底部供参考
const EXPIRED_MODELS: ModelInfo[] = [
  { id: "qwen3.7-max-2026-05-20", name: "Qwen3.7-Max (0520) ⚠️已过期", quota: 1_000_000, expiresAt: "2026-08-24", badge: "已过期", badgeColor: "red" },
  { id: "qwen3.7-max-preview", name: "Qwen3.7-Max-Preview ⚠️已过期", quota: 994_354, expiresAt: "2026-08-24", badge: "已过期", badgeColor: "red" },
];

const THINKING_LEVELS: { value: "off" | "low" | "medium" | "high"; label: string; desc: string; icon: typeof Brain }[] = [
  { value: "off", label: "关闭", desc: "不启用推理链，响应最快", icon: Zap },
  { value: "low", label: "低", desc: "简短推理，平衡速度与质量", icon: Gauge },
  { value: "medium", label: "中", desc: "标准推理深度", icon: Brain },
  { value: "high", label: "高", desc: "深度推理链，质量最高但较慢", icon: Sparkles },
];

const ENGINE_META = {
  PI: { name: "Pi Agent", icon: Brain, gradient: "from-violet-500 to-fuchsia-600", desc: "强推理引擎，默认使用 Qwen3.8-Max" },
  GROK: { name: "Grok Agent", icon: Cpu, gradient: "from-amber-500 to-orange-600", desc: "快响应引擎，默认使用 Qwen3.7-Plus" },
} as const;

type Provider = "PI" | "GROK";

function EngineCard({
  provider,
  config,
  loading,
  onUpdate,
}: {
  provider: Provider;
  config: EngineConfigItem | null;
  loading: boolean;
  onUpdate: (provider: Provider, patch: { model?: string; thinkingLevel?: "off" | "low" | "medium" | "high"; isEnabled?: boolean }) => void;
}) {
  const meta = ENGINE_META[provider];
  const Icon = meta.icon;
  const currentModel = config?.model ?? (provider === "PI" ? "qwen3.8-max" : "qwen3.7-plus");
  const currentThinking = config?.thinkingLevel ?? "medium";
  const isEnabled = config?.isEnabled ?? true;
  const [modelOpen, setModelOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(currentModel);
  const [thinking, setThinking] = useState<"off" | "low" | "medium" | "high">(currentThinking);
  const [enabled, setEnabled] = useState(isEnabled);

  useEffect(() => {
    if (config) {
      setSelectedModel(config.model ?? (provider === "PI" ? "qwen3.8-max" : "qwen3.7-plus"));
      setThinking((config.thinkingLevel as typeof thinking) ?? "medium");
      setEnabled(config.isEnabled ?? true);
    }
  }, [config, provider]);

  const modelInfo = MODELS.find((m) => m.id === selectedModel) ?? EXPIRED_MODELS.find((m) => m.id === selectedModel);
  const isExpired = modelInfo?.badge === "已过期";

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    setModelOpen(false);
    onUpdate(provider, { model: modelId });
  };

  const handleThinkingChange = (level: "off" | "low" | "medium" | "high") => {
    setThinking(level);
    onUpdate(provider, { thinkingLevel: level });
  };

  const handleToggle = () => {
    setEnabled((v) => {
      const next = !v;
      onUpdate(provider, { isEnabled: next });
      return next;
    });
  };

  return (
    <Card className={cn("relative overflow-hidden border-slate-200/60 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/80")}>
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${meta.gradient}`} />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br shadow-md", meta.gradient)}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{meta.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{meta.desc}</p>
            </div>
          </div>
          {/* 启用开关 */}
          <button
            type="button"
            onClick={handleToggle}
            disabled={loading}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
              enabled
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
            )}
          >
            {enabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {enabled ? "已启用" : "已禁用"}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 模型选择 */}
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">模型</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setModelOpen((v) => !v)}
              disabled={loading || !enabled}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all",
                "border-slate-200 bg-white hover:border-blue-300 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10",
                "dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700",
                (!enabled) && "opacity-50 cursor-not-allowed",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate font-medium">{modelInfo?.name ?? selectedModel}</span>
                {modelInfo?.badge && (
                  <span className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                    modelInfo.badgeColor === "emerald" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                    modelInfo.badgeColor === "blue" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                    modelInfo.badgeColor === "violet" && "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
                    modelInfo.badgeColor === "amber" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                    modelInfo.badgeColor === "red" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                  )}>
                    {modelInfo.badge}
                  </span>
                )}
              </div>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", modelOpen && "rotate-180")} />
            </button>

            {/* 下拉列表 */}
            {modelOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {/* 可用模型 */}
                {MODELS.map((m) => {
                  const expired = new Date(m.expiresAt) < new Date();
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleModelChange(m.id)}
                      disabled={expired}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                        selectedModel === m.id
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                          : "text-foreground hover:bg-slate-50 dark:hover:bg-slate-800",
                        expired && "opacity-40 cursor-not-allowed",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{m.name}</span>
                          {m.badge && m.badge !== "已过期" && (
                            <span className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                              m.badgeColor === "emerald" && "bg-emerald-100 text-emerald-700",
                              m.badgeColor === "blue" && "bg-blue-100 text-blue-700",
                              m.badgeColor === "violet" && "bg-violet-100 text-violet-700",
                              m.badgeColor === "amber" && "bg-amber-100 text-amber-700",
                            )}>
                              {m.badge}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span>额度 {m.quota >= 1_000_000 ? "100万" : Math.round(m.quota / 10_000) + "万"}</span>
                          <span>·</span>
                          <Calendar className="h-2.5 w-2.5" />
                          <span>过期 {m.expiresAt}</span>
                        </div>
                      </div>
                      {selectedModel === m.id && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                    </button>
                  );
                })}
                {/* 已过期模型分隔 */}
                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                {EXPIRED_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModelChange(m.id)}
                    disabled
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-400 opacity-50 cursor-not-allowed"
                  >
                    <div className="min-w-0">
                      <span className="font-medium truncate">{m.name}</span>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span>额度 {Math.round(m.quota / 10_000)}万</span>
                        <span>·</span>
                        <span className="text-red-500">已过期 ({m.expiresAt})</span>
                      </div>
                    </div>
                    {selectedModel === m.id && <CheckCircle2 className="h-4 w-4 shrink-0 text-red-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* 当前模型状态提示 */}
          {modelInfo && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400">
              {isExpired
                ? <><AlertCircle className="h-3 w-3 text-red-500" /> 当前模型已过期，建议切换到其他可用模型</>
                : <><TrendingUp className="h-3 w-3 text-emerald-500" /> 免费额度剩余 {modelInfo.quota >= 1_000_000 ? "100万" : Math.round(modelInfo.quota / 10_000) + "万"} tokens，{modelInfo.expiresAt} 过期</>}
            </div>
          )}
        </div>

        {/* 推理级别 */}
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">推理级别</label>
          <div className="grid grid-cols-4 gap-1.5">
            {THINKING_LEVELS.map((lv) => {
              const Icon2 = lv.icon;
              const active = thinking === lv.value;
              return (
                <button
                  key={lv.value}
                  type="button"
                  onClick={() => handleThinkingChange(lv.value)}
                  disabled={loading || !enabled}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-all",
                    active
                      ? cn("border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
                          !enabled && "opacity-50")
                      : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800",
                    (!enabled) && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <Icon2 className={cn("h-4 w-4", active ? "text-blue-600 dark:text-blue-300" : "text-slate-400")} />
                  <span className="font-medium">{lv.label}</span>
                  <span className="text-[9px] text-slate-400 leading-tight text-center">{lv.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EnginesPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [configs, setConfigs] = useState<Record<Provider, EngineConfigItem | null>>({ PI: null, GROK: null });
  const [loading, setLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchEngineConfigs()
      .then((data) => {
        const map: Record<Provider, EngineConfigItem | null> = { PI: null, GROK: null };
        for (const c of data) {
          const p = c.provider as Provider;
          if (p in map) map[p] = c;
        }
        setConfigs(map);
        setLoading(false);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : "加载失败"); setLoading(false); });
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleUpdate = useCallback(async (provider: Provider, patch: { model?: string; thinkingLevel?: "off" | "low" | "medium" | "high"; isEnabled?: boolean }) => {
    setUpdateLoading(provider);
    try {
      const updated = await updateEngineConfig(provider, patch);
      setConfigs((prev) => ({ ...prev, [provider]: updated }));
    } catch {
      // 静默失败，UI 回滚由 local state 处理
      reload();
    }
    setUpdateLoading(null);
  }, [reload]);

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
      <header className="shrink-0 border-b border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
              <Settings className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground">引擎配置</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="h-7 gap-1 text-xs">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              刷新
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-5">
        {/* 提示卡片 */}
        <Card className="border-blue-200/60 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20">
          <CardContent className="flex items-start gap-3 py-3">
            <Shield className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-xs text-blue-800 dark:text-blue-200">
              <p className="font-semibold">模型免费额度</p>
              <p className="mt-0.5 text-blue-700/80 dark:text-blue-300/80">
                当前所有模型均有阿里云百炼提供的免费额度（约 100 万 tokens）。
                上方列表标注了各模型的过期时间，过期后需切换到其他可用模型。
                配置会保存到数据库，按租户隔离。
              </p>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* 引擎配置卡片 */}
        <div className="grid gap-4">
          {(["PI", "GROK"] as Provider[]).map((provider) => (
            <EngineCard
              key={provider}
              provider={provider}
              config={configs[provider]}
              loading={updateLoading === provider}
              onUpdate={handleUpdate}
            />
          ))}
        </div>

        {/* 模型对照表 */}
        <Card className="border-slate-200/60 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" />
              模型对照表
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              所有模型均通过阿里云百炼 OpenAI 兼容接口接入。Pi 引擎默认使用强推理模型，Grok 引擎默认使用均衡模型。
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">模型</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">额度</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">过期时间</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {MODELS.map((m) => {
                    const expired = new Date(m.expiresAt) < new Date();
                    return (
                      <tr key={m.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                        <td className="py-2.5 pr-3 font-medium text-foreground">{m.name}</td>
                        <td className="px-2 py-2.5 text-center text-slate-500">{m.quota >= 1_000_000 ? "100万" : Math.round(m.quota / 10_000) + "万"}</td>
                        <td className="px-2 py-2.5 text-center text-slate-500">{m.expiresAt}</td>
                        <td className="px-2 py-2.5 text-center">
                          {m.badge === "已过期" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">已过期</span>
                          ) : expired ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">已过期</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">可用</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
