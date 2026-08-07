/**
 * NZi Agent Web — Chat Zustand Store
 *
 * 管理 Chat 会话状态，包括：
 * - WebSocket 连接管理和生命周期
 * - 消息列表 (messages) 和正在流式生成的当前消息 (streamingMessage)
 * - 连接状态 (connectionStatus)
 * - 待停止的请求映射 (activeRequestIds -> sessionIds)
 *
 * 设计原则：
 * - Hook 层负责 WebSocket 事件监听和 dispatch
 * - Store 层负责纯状态管理，不依赖 URL / 副作用
 */

import { create } from "zustand";

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool_result";
  content: string;
  reasoning?: string;
  status: "streaming" | "completed" | "interrupted" | "error";
  createdAt: Date;
  latencyMs?: number;
}

interface ActiveRequest {
  sessionId: string;
  requestId: string;
  startedAt: number;
}

interface ChatState {
  // 连接状态
  connectionStatus: "idle" | "connecting" | "connected" | "disconnected" | "error";
  connectionError: string | null;

  // 按 sessionId 分组的消息列表
  messagesBySession: Record<string, ChatMessage[]>;

  // 当前正在流式写入的 assistant 消息（每 session 最多一个 streaming）
  streamingBySession: Record<string, ChatMessage | null>;

  // 活跃的（正在生成中的）请求
  activeRequests: ActiveRequest[];

  // WebSocket 实例（不持久化，由 Hook 在连接时注入）
  ws: WebSocket | null;
}

interface ChatActions {
  setConnectionStatus: (status: ChatState["connectionStatus"]) => void;
  setConnectionError: (error: string | null) => void;
  setWebSocket: (ws: WebSocket | null) => void;

  appendMessage: (sessionId: string, message: ChatMessage) => void;
  updateStreamingContent: (sessionId: string, delta: string) => void;
  completeStreaming: (sessionId: string, message: ChatMessage) => void;
  interruptStreaming: (sessionId: string, partialText: string) => void;
  markStreamingError: (sessionId: string, errorText: string) => void;

  registerActiveRequest: (sessionId: string, requestId: string) => void;
  unregisterActiveRequest: (requestId: string) => void;

  reset: () => void;
}

export type ChatStore = ChatState & ChatActions;

const initialActiveSessionState = {
  connectionStatus: "idle" as const,
  connectionError: null,
  messagesBySession: {},
  streamingBySession: {},
  activeRequests: [],
  ws: null,
};

export const useChatStore = create<ChatStore>((set, get) => ({
  ...initialActiveSessionState,

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setConnectionError: (error) => set({ connectionError: error }),
  setWebSocket: (ws) => set({ ws }),

  appendMessage: (sessionId, message) =>
    set((state) => {
      const existing = state.messagesBySession[sessionId] ?? [];
      const deduped = existing.some((m) => m.id === message.id) ? existing : [...existing, message];
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: deduped,
        },
      };
    }),

  updateStreamingContent: (sessionId, delta) =>
    set((state) => {
      const current = state.streamingBySession[sessionId];
      if (!current) return state;
      const updated = {
        ...current,
        content: current.content + delta,
      };
      return {
        streamingBySession: {
          ...state.streamingBySession,
          [sessionId]: updated,
        },
      };
    }),

  completeStreaming: (sessionId, message) =>
    set((state) => {
      const existing = state.messagesBySession[sessionId] ?? [];
      const deduped = existing.some((m) => m.id === message.id)
        ? existing.map((m) => (m.id === message.id ? message : m))
        : [...existing, message];
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: deduped,
        },
        streamingBySession: {
          ...state.streamingBySession,
          [sessionId]: null,
        },
        activeRequests: state.activeRequests.filter((r) => r.requestId !== message.id),
      };
    }),

  interruptStreaming: (sessionId, partialText) =>
    set((state) => {
      const streaming = state.streamingBySession[sessionId];
      if (!streaming) return state;
      const interrupted: ChatMessage = {
        ...streaming,
        content: partialText + "\n\n[生成已停止]",
        status: "interrupted",
      };
      const existing = state.messagesBySession[sessionId] ?? [];
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: [...existing, interrupted],
        },
        streamingBySession: {
          ...state.streamingBySession,
          [sessionId]: null,
        },
        activeRequests: state.activeRequests.filter((r) => r.requestId !== streaming.id),
      };
    }),

  markStreamingError: (sessionId, errorText) =>
    set((state) => {
      const streaming = state.streamingBySession[sessionId];
      if (!streaming) return state;
      const errored: ChatMessage = {
        ...streaming,
        content: errorText,
        status: "error",
      };
      const existing = state.messagesBySession[sessionId] ?? [];
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: [...existing, errored],
        },
        streamingBySession: {
          ...state.streamingBySession,
          [sessionId]: null,
        },
        activeRequests: state.activeRequests.filter((r) => r.requestId !== streaming.id),
      };
    }),

  registerActiveRequest: (sessionId, requestId) =>
    set((state) => ({
      activeRequests: [
        ...state.activeRequests,
        { sessionId, requestId, startedAt: Date.now() },
      ],
    })),

  unregisterActiveRequest: (requestId) =>
    set((state) => ({
      activeRequests: state.activeRequests.filter((r) => r.requestId !== requestId),
    })),

  reset: () => set(initialActiveSessionState),
}));
