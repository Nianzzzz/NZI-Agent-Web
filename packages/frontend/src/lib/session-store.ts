import { create } from "zustand";
import { useAuthStore } from "./auth-store";

export interface Session {
  id: string;
  title: string | null;
  engine?: "PI" | "GROK";
  status?: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string | null;
}

interface SessionState {
  sessions: Session[];
  isLoading: boolean;
  isDeleting: Record<string, boolean>;
  error: string | null;
}

interface SessionActions {
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchSessions: () => Promise<void>;
  createSession: (params: { title?: string; engine?: "PI" | "GROK" }) => Promise<Session>;
  renameSession: (id: string, title: string) => Promise<void>;
}

export const useSessionStore = create<SessionState & SessionActions>((set, get) => ({
  sessions: [],
  isLoading: false,
  isDeleting: {},
  error: null,
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),
  removeSession: async (id) => {
    // 标记删除中，防止重复触发
    set((state) => ({ isDeleting: { ...state.isDeleting, [id]: true } }));
    try {
      const token = useAuthStore.getState().token;
      if (!token) throw new Error("未登录");
      const res = await fetch(`/api/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`删除失败: ${res.status} ${body}`);
      }
      // 后端删除成功 → 乐观从列表移除
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
        isDeleting: { ...state.isDeleting, [id]: false },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      // 删除失败：清除删除中状态，报错提示
      set((state) => ({
        isDeleting: { ...state.isDeleting, [id]: false },
        error: message,
      }));
    }
  },
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  fetchSessions: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ error: "未登录", sessions: [] });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const response = await fetch("/api/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.status}`);
      }
      const data = (await response.json()) as { sessions: Session[] };
      set({ sessions: data.sessions, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      set({ error: message, isLoading: false });
    }
  },

  createSession: async ({ title, engine = "PI" }) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error("未登录");
    }
    set({ isLoading: true, error: null });
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, engine }),
      });
      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Failed to create session: ${response.status} ${errBody}`);
      }
      const session = (await response.json()) as Session;
      get().addSession(session);
      set({ isLoading: false });
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  renameSession: async (id, title) => {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error("未登录");
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`重命名失败: ${res.status}`);
      const updated = (await res.json()) as Session;
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, title: updated.title } : s)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "重命名失败";
      set((state) => ({ error: message }));
      throw err;
    }
  },
}));
