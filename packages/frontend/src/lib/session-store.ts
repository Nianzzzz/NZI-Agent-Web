import { create } from "zustand";
import { useAuthStore } from "./auth-store";

export interface Session {
  id: string;
  title: string | null;
  engine: "PI" | "GROK";
  status?: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string | null;
}

interface SessionState {
  sessions: Session[];
  isLoading: boolean;
  error: string | null;
}

interface SessionActions {
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchSessions: () => Promise<void>;
  createSession: (params: { title?: string; engine?: "PI" | "GROK" }) => Promise<Session>;
}

export const useSessionStore = create<SessionState & SessionActions>((set, get) => ({
  sessions: [],
  isLoading: false,
  error: null,
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),
  removeSession: (id) => {
    // 乐观删除：先立即从列表移除，再异步调后端
    set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) }));
    // 异步调后端 DELETE
    const token = useAuthStore.getState().token;
    if (token) {
      fetch(`/api/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {
        // 后端删除失败，静默刷新恢复
        get().fetchSessions();
      });
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
}));
