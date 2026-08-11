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
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; displayName: string | null };
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
