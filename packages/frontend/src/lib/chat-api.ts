/**
 * Session API client
 *
 * 拉取单个 session 的元数据 / 消息历史，用于聊天页初始化。
 */
import { useAuthStore } from "@/lib/auth-store";

const API_BASE = ""; // 走 Next.js rewrite

export interface SessionDetail {
  id: string;
  title: string | null;
  engine: "PI" | "GROK";
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; displayName: string | null };
  /** 关联的 Arena 对战 ID（仅 Arena 会话有此值） */
  arenaMatchId?: string | null;
}

import type { TimelineNode } from "@/types/chat.types";

export interface HistoryMessage {
  id: string;
  sessionId: string;
  role: "USER" | "ASSISTANT" | "TOOL_RESULT";
  content: string;
  reasoning?: string | null;
  status: "COMPLETED" | "INTERRUPTED";
  createdAt: string;
  latencyMs?: number | null;
  /** T010: 完整的 Agent Loop Timeline 节点（刷新后用于恢复推理过程） */
  timelineNodes?: TimelineNode[] | null;
  /** Arena 对战侧标识（A=PI, B=GROK），仅 Arena 会话的消息有此值 */
  arenaSide?: string | null;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchSessionDetail(id: string): Promise<SessionDetail | null> {
  const res = await fetch(`${API_BASE}/api/sessions/${id}`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
  return res.json();
}

export async function deleteMessage(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/messages/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (res.status === 404) throw new Error("消息不存在或无权限");
  if (!res.ok) throw new Error(`Failed to delete message: ${res.status}`);
}

/** 删除完整的对话轮次（user + assistant），刷新后不会回来 */
export async function deleteTurn(id: string): Promise<number> {
  const res = await fetch(`${API_BASE}/api/messages/${id}/turn`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (res.status === 404) throw new Error("消息不存在或无权限");
  if (!res.ok) throw new Error(`Failed to delete turn: ${res.status}`);
  const { deletedCount } = (await res.json()) as { deletedCount: number };
  return deletedCount;
}

/** 删除某条消息之后的所有消息（含该消息本身），用于编辑/重新生成 */
export async function deleteMessagesFrom(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/messages/${id}/after`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (res.status === 404) throw new Error("消息不存在或无权限");
  if (!res.ok) throw new Error(`Failed to delete messages from: ${res.status}`);
}

export async function fetchSessionMessages(
  id: string,
  limit = 200,
): Promise<HistoryMessage[]> {
  const res = await fetch(
    `${API_BASE}/api/sessions/${id}/messages?limit=${limit}`,
    { headers: { "Content-Type": "application/json", ...authHeaders() } },
  );
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
  const { messages } = (await res.json()) as { messages: HistoryMessage[] };
  return messages;
}

/** 上传文件到服务端临时目录，返回文件路径信息 */
export interface UploadedFile {
  filePath: string;
  filename: string;
  size: number;
  mimeType: string;
}

export async function uploadFile(
  sessionId: string,
  file: File,
): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(
    `${API_BASE}/api/files/upload?sessionId=${encodeURIComponent(sessionId)}`,
    { method: "POST", headers: authHeaders(), body: formData },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`上传失败 (${res.status}): ${body}`);
  }
  return res.json() as Promise<UploadedFile>;
}

// ─── Arena 对战历史 ─────────────────────────────────────────────────

export interface ArenaHistoryItem {
  matchId: string;
  prompt: string;
  thinkingLevel: "off" | "low" | "medium" | "high";
  status: "running" | "completed";
  sessionId: string;
  createdAt: string;
  votes: { A: number; B: number; tie: number };
  totalVotes: number;
}

export async function fetchArenaHistory(): Promise<ArenaHistoryItem[]> {
  const res = await fetch(`${API_BASE}/api/arena`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to fetch arena history: ${res.status}`);
  const data = (await res.json()) as { matches: Array<{
    matchId: string;
    prompt: string;
    thinkingLevel: "off" | "low" | "medium" | "high";
    status: "running" | "completed";
    sides: Array<{ label: "A" | "B"; provider: "PI" | "GROK"; sessionId: string }>;
    createdAt: number;
    votes: { A: number; B: number; tie: number };
  }> };
  return (data.matches ?? []).map((m) => ({
    matchId: m.matchId,
    prompt: m.prompt,
    thinkingLevel: m.thinkingLevel,
    status: m.status,
    sessionId: m.sides?.[0]?.sessionId ?? "",
    createdAt: new Date(m.createdAt).toISOString(),
    votes: m.votes,
    totalVotes: (m.votes?.A ?? 0) + (m.votes?.B ?? 0) + (m.votes?.tie ?? 0),
  }));
}

export async function deleteArenaMatch(matchId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/arena/${matchId}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (res.status === 404) throw new Error("对战不存在或无权限");
  if (!res.ok) throw new Error(`Failed to delete arena match: ${res.status}`);
}

// ─── Phase 3: Web Search ────────────────────────────────────────────────

export interface WebSearchConfig {
  id: string;
  provider: "duckduckgo" | "serpapi";
  maxResults: number;
  isEnabled: boolean;
  createdAt: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function fetchWebSearchConfig(): Promise<WebSearchConfig[]> {
  const res = await fetch(`${API_BASE}/api/web-search/config`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to fetch web search config: ${res.status}`);
  const { configs } = (await res.json()) as { configs: WebSearchConfig[] };
  return configs;
}

export async function updateWebSearchConfig(input: {
  provider: "duckduckgo" | "serpapi";
  apiKey?: string;
  maxResults?: number;
  isEnabled?: boolean;
}): Promise<WebSearchConfig> {
  const res = await fetch(`${API_BASE}/api/web-search/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to update web search config: ${res.status}`);
  const { config } = (await res.json()) as { config: WebSearchConfig };
  return config;
}

export async function testWebSearch(query: string, maxResults?: number): Promise<WebSearchResult[]> {
  const res = await fetch(`${API_BASE}/api/web-search/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ query, maxResults }),
  });
  if (!res.ok) throw new Error(`Failed to search: ${res.status}`);
  const { results } = (await res.json()) as { results: WebSearchResult[] };
  return results;
}

// ─── Phase 3: Skills ─────────────────────────────────────────────────────

export interface SkillItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  version: string;
  author: string;
  authorType: "system" | "community" | "user";
  icon: string;
  tags: string[];
  prompt: string;
  tools: string[];
  downloads: number;
  rating: number;
  isPublic: boolean;
  isInstalled?: boolean;
  isEnabled?: boolean;
  createdAt: string;
}

export async function fetchSkills(params?: {
  category?: string;
  search?: string;
  sort?: "popular" | "newest" | "rating";
}): Promise<SkillItem[]> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set("category", params.category);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.sort) searchParams.set("sort", params.sort);
  const qs = searchParams.toString();
  const res = await fetch(`${API_BASE}/api/skills${qs ? `?${qs}` : ""}`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to fetch skills: ${res.status}`);
  const { skills } = (await res.json()) as { skills: SkillItem[] };
  return skills;
}

export async function fetchInstalledSkills(): Promise<SkillItem[]> {
  const res = await fetch(`${API_BASE}/api/user/skills`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to fetch installed skills: ${res.status}`);
  const { skills } = (await res.json()) as { skills: SkillItem[] };
  return skills;
}

export async function createSkill(input: {
  name: string;
  displayName: string;
  description: string;
  category: string;
  icon?: string;
  tags?: string[];
  prompt: string;
  tools?: string[];
  isPublic?: boolean;
}): Promise<SkillItem> {
  const res = await fetch(`${API_BASE}/api/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create skill: ${res.status}`);
  const { skill } = (await res.json()) as { skill: SkillItem };
  return skill;
}

export async function installSkill(skillId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/skills/${skillId}/install`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to install skill: ${res.status}`);
}

export async function uninstallSkill(skillId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/skills/${skillId}/uninstall`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to uninstall skill: ${res.status}`);
}

export async function toggleSkill(skillId: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/api/skills/${skillId}/toggle`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`Failed to toggle skill: ${res.status}`);
}

// ─── Phase 3: MCP ────────────────────────────────────────────────────────

export interface McpServerItem {
  id: string;
  name: string;
  description: string | null;
  transport: "stdio" | "sse" | "streamable";
  command: string | null;
  url: string | null;
  env: Record<string, string> | null;
  isEnabled: boolean;
  status: "disconnected" | "connecting" | "connected" | "error";
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  createdAt: string;
}

export interface McpPreset {
  name: string;
  description: string;
  transport: "stdio";
  command: string;
  env?: Record<string, string>;
  icon: string;
  category?: string;
}

export async function fetchMcpServers(): Promise<McpServerItem[]> {
  const res = await fetch(`${API_BASE}/api/mcp/servers`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to fetch MCP servers: ${res.status}`);
  const { servers } = (await res.json()) as { servers: McpServerItem[] };
  return servers;
}

export async function fetchMcpPresets(): Promise<McpPreset[]> {
  const res = await fetch(`${API_BASE}/api/mcp/presets`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to fetch MCP presets: ${res.status}`);
  const { presets } = (await res.json()) as { presets: McpPreset[] };
  return presets;
}

export async function createMcpServer(input: {
  name: string;
  description?: string;
  transport: "stdio" | "sse" | "streamable";
  command?: string;
  url?: string;
  env?: Record<string, string>;
  isEnabled?: boolean;
}): Promise<McpServerItem> {
  const res = await fetch(`${API_BASE}/api/mcp/servers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create MCP server: ${res.status}`);
  const { server } = (await res.json()) as { server: McpServerItem };
  return server;
}

export async function deleteMcpServer(serverId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/mcp/servers/${serverId}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to delete MCP server: ${res.status}`);
}

export async function connectMcpServer(serverId: string): Promise<McpServerItem["tools"]> {
  const res = await fetch(`${API_BASE}/api/mcp/servers/${serverId}/connect`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to connect MCP server: ${res.status}`);
  const { tools } = (await res.json()) as { tools: McpServerItem["tools"] };
  return tools;
}

export async function disconnectMcpServer(serverId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/mcp/servers/${serverId}/disconnect`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to disconnect MCP server: ${res.status}`);
}

// ─── Engine Configuration ──────────────────────────────────────────

export interface EngineConfigItem {
  id: string;
  provider: "PI" | "GROK";
  model: string | null;
  thinkingLevel: "off" | "low" | "medium" | "high" | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchEngineConfigs(): Promise<EngineConfigItem[]> {
  const res = await fetch(`${API_BASE}/api/engine-config`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch engine configs: ${res.status}`);
  const data = (await res.json()) as { configs: EngineConfigItem[] };
  return data.configs;
}

export async function updateEngineConfig(
  provider: "PI" | "GROK",
  patch: { apiKey?: string; model?: string; thinkingLevel?: "off" | "low" | "medium" | "high"; isEnabled?: boolean },
): Promise<EngineConfigItem> {
  const res = await fetch(`${API_BASE}/api/engine-config/${provider}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update engine config: ${res.status}`);
  const data = (await res.json()) as { config: EngineConfigItem };
  return data.config;
}
