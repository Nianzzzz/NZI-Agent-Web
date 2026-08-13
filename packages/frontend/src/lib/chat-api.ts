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
