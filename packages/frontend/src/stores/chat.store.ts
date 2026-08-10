/**
 * NZi Agent Web — Chat Zustand Store
 *
 * 管理 Chat 会话状态，包括：
 * - WebSocket 连接管理和生命周期
 * - 消息列表 (messages) 和正在流式生成的当前消息 (streamingMessage)
 * - 连接状态 (connectionStatus)
 * - 待停止的请求映射 (activeRequestIds -> sessionIds)
 * - T010: 每条 assistant 消息携带 nodes: TimelineNode[]（Agent Loop Timeline）
 *
 * 设计原则：
 * - Hook 层负责 WebSocket 事件监听和 dispatch
 * - Store 层负责纯状态管理，不依赖 URL / 副作用
 */

import { create } from "zustand";
import type { TimelineNode } from "@/types/chat.types";

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool_result";
  content: string;
  reasoning?: string;
  status: "streaming" | "completed" | "interrupted" | "error";
  createdAt: Date;
  latencyMs?: number;
  /** T010: Agent Loop Timeline 节点 */
  nodes?: TimelineNode[];
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
  /** 用 DB 历史消息整体替换该 session 的消息列表（避免临时 ID 与 DB ID 重复） */
  replaceMessages: (sessionId: string, messages: ChatMessage[]) => void;
  updateStreamingContent: (sessionId: string, delta: string) => void;
  /** 设置 streaming 消息（占位，供 addNode/appendNodeDelta 使用） */
  setStreaming: (sessionId: string, message: ChatMessage) => void;
  completeStreaming: (sessionId: string, message: ChatMessage) => void;
  interruptStreaming: (sessionId: string, partialText: string) => void;
  markStreamingError: (sessionId: string, errorText: string) => void;

  /** T010: 在 streaming 消息上添加一个新节点 */
  addNode: (sessionId: string, node: TimelineNode) => void;
  /** T010: 追加节点 delta 内容（更新 content + node.delta） */
  appendNodeDelta: (sessionId: string, nodeId: string, delta: string) => void;
  /** T010: 标记节点为 done/error 状态 */
  finalizeNode: (
    sessionId: string,
    nodeId: string,
    updates: Partial<Pick<TimelineNode, "status" | "title" | "toolOutput" | "durationMs">>,
  ) => void;

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

/** helper: 修改 streamingBySession 中某条消息的 nodes 数组 */
function patchNodes(
  state: ChatState,
  sessionId: string,
  patcher: (nodes: TimelineNode[]) => TimelineNode[],
): Partial<ChatState> {
  const streaming = state.streamingBySession[sessionId];
  if (!streaming) return {};
  const existing = streaming.nodes ?? [];
  const updated: ChatMessage = {
    ...streaming,
    nodes: patcher(existing),
  };
  return {
    streamingBySession: {
      ...state.streamingBySession,
      [sessionId]: updated,
    },
  };
}

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

  replaceMessages: (sessionId, messages) =>
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: messages,
      },
    })),

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

  setStreaming: (sessionId, message) =>
    set((state) => ({
      streamingBySession: {
        ...state.streamingBySession,
        [sessionId]: message,
      },
    })),

  completeStreaming: (sessionId, message) =>
    set((state) => {
      const streaming = state.streamingBySession[sessionId];
      // 把 streaming 期间积累的 nodes 保留到最终消息
      const finalMessage: ChatMessage = {
        ...message,
        nodes: streaming?.nodes ?? message.nodes,
      };
      const existing = state.messagesBySession[sessionId] ?? [];
      const deduped = existing.some((m) => m.id === finalMessage.id)
        ? existing.map((m) => (m.id === finalMessage.id ? finalMessage : m))
        : [...existing, finalMessage];
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: deduped,
        },
        streamingBySession: {
          ...state.streamingBySession,
          [sessionId]: null,
        },
        activeRequests: state.activeRequests.filter((r) => r.requestId !== finalMessage.id),
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

  addNode: (sessionId, node) =>
    set((state) => patchNodes(state, sessionId, (nodes) => [...nodes, node])),

  appendNodeDelta: (sessionId, nodeId, delta) =>
    set((state) => {
      const patch = patchNodes(state, sessionId, (nodes) =>
        nodes.map((n) => (n.id === nodeId ? { ...n, delta: (n.delta ?? "") + delta } : n)),
      );
      // 同时把 delta 拼到 streaming.content（让 message.content 仍反映最终文本）
      const streaming = state.streamingBySession[sessionId];
      if (streaming) {
        const node = (streaming.nodes ?? []).find((n) => n.id === nodeId);
        // 只把 answer 节点的内容加到顶层 content；thinking/tool 不计入顶层文本
        if (node?.type === "answer") {
          const updated: ChatMessage = {
            ...streaming,
            content: streaming.content + delta,
          };
          return {
            ...patch,
            streamingBySession: {
              ...state.streamingBySession,
              [sessionId]: updated,
            },
          };
        }
      }
      return patch;
    }),

  finalizeNode: (sessionId, nodeId, updates) =>
    set((state) =>
      patchNodes(state, sessionId, (nodes) =>
        nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
      ),
    ),

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
