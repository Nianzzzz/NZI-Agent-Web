"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore, type ChatMessage } from "@/stores/chat.store";
import type { TimelineNode } from "@/types/chat.types";

export interface UseChatSocketOptions {
  readonly sessionId: string;
  readonly token?: string | null;
  readonly autoConnect?: boolean;
  readonly onConnect?: () => void;
  readonly onDisconnect?: () => void;
  readonly onError?: (error: string) => void;
}

export interface UseChatSocketReturn {
  readonly connectionStatus: "idle" | "connecting" | "connected" | "disconnected" | "error";
  readonly connectionError: string | null;
  readonly messages: ChatMessage[];
  readonly streamingMessage: ChatMessage | null;
  readonly isGenerating: boolean;
  /** 已发出请求但尚未收到首个 token（思考或回答），用于显示缓冲提示 */
  readonly buffering: boolean;
  readonly currentRequestId: string | null;
  readonly sendChat: (prompt: string, agentType?: "PI" | "GROK", thinkingLevel?: "off" | "low" | "medium" | "high", workingDirectory?: string) => void;
  readonly stopGeneration: () => void;
  readonly connect: () => void;
  readonly disconnect: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000").replace(/^http/, "ws");

type IncomingMessage =
  | { type: "chunk"; payload: { requestId?: string; delta: string; reasoning?: boolean } }
  | { type: "node"; payload: { requestId?: string; node: TimelineNode } }
  | { type: "done"; payload: { requestId?: string; content: string; latencyMs?: number; nodes?: TimelineNode[] } }
  | { type: "error"; payload: { requestId?: string; message: string } }
  | { type: "interrupted"; payload: { requestId?: string; content: string; reason: string } }
  | { type: "status"; payload: { requestId?: string; text?: string } };

export function useChatSocket({
  sessionId,
  token,
  autoConnect = true,
  onConnect,
  onDisconnect,
  onError,
}: UseChatSocketOptions): UseChatSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const activeRequestIdRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const mountedRef = useRef(true); // T010: track mount to prevent updates after unmount
  const [, forceTick] = useState(0);

  const {
    connectionStatus,
    connectionError,
    messagesBySession,
    streamingBySession,
    activeRequests,
    setConnectionStatus,
    setConnectionError,
    setWebSocket,
    appendMessage,
    updateStreamingContent,
    setStreaming,
    completeStreaming,
    interruptStreaming,
    markStreamingError,
    addNode,
    appendNodeDelta,
    finalizeNode,
    registerActiveRequest,
    unregisterActiveRequest,
  } = useChatStore();

  const messages: ChatMessage[] = messagesBySession[sessionId] ?? [];
  const streamingMessage: ChatMessage | null = streamingBySession[sessionId] ?? null;
  const isGenerating = !!streamingMessage;

  // buffering：已发出请求但尚未收到首个 token（思考或回答）
  const firstTokenRef = useRef(true);
  const [buffering, setBuffering] = useState(false);

  const clearReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
  }, []);

  const handleIncoming = useCallback(
    (sessionIdLocal: string, data: IncomingMessage) => {
      switch (data.type) {
        case "status":
          // 暂不展示 status 文本
          break;
        case "node": {
          const node = data.payload?.node;
          if (!node) return;
          const { id, phase, type, title, delta, status: nodeStatus, toolInput, toolOutput, durationMs, startedAt } = node;
          if (phase === "start") {
            addNode(sessionIdLocal, { id, type, phase, title, status: "running", toolInput, startedAt });
          } else if (phase === "delta") {
            appendNodeDelta(sessionIdLocal, id, delta ?? "");
          } else if (phase === "end" || phase === "error") {
            finalizeNode(sessionIdLocal, id, {
              status: nodeStatus ?? (phase === "error" ? "error" : "done"),
              title,
              toolOutput,
              durationMs,
              // 后端在 end 事件中回传完整 delta，确保前端拿到完整内容
              delta: delta ?? undefined,
            } as never);
          }
          forceTick((n) => n + 1);
          break;
        }
        case "chunk": {
          const delta = data.payload?.delta ?? "";
          if (!delta) return;
          updateStreamingContent(sessionIdLocal, delta);
          if (firstTokenRef.current) {
            firstTokenRef.current = false;
            setBuffering(false);
          }
          forceTick((n) => n + 1);
          break;
        }
        case "done": {
          const finalContent = data.payload?.content ?? "";
          const reqId = data.payload?.requestId ?? activeRequestIdRef.current;
          firstTokenRef.current = true; // 本轮结束，重置
          if (reqId) {
            completeStreaming(sessionIdLocal, {
              id: reqId,
              sessionId: sessionIdLocal,
              role: "assistant",
              content: finalContent,
              status: "completed",
              createdAt: new Date(),
              latencyMs: data.payload?.latencyMs,
              nodes: data.payload?.nodes,
            });
          }
          activeRequestIdRef.current = null;
          forceTick((n) => n + 1);
          break;
        }
        case "error": {
          const message = data.payload?.message ?? "Unknown error";
          firstTokenRef.current = true;
          markStreamingError(sessionIdLocal, message);
          activeRequestIdRef.current = null;
          forceTick((n) => n + 1);
          break;
        }
        case "interrupted": {
          const partial = data.payload?.content ?? "";
          interruptStreaming(sessionIdLocal, partial);
          activeRequestIdRef.current = null;
          forceTick((n) => n + 1);
          break;
        }
        default:
          break;
      }
    },
    [
      updateStreamingContent,
      setStreaming,
      completeStreaming,
      markStreamingError,
      interruptStreaming,
      addNode,
      appendNodeDelta,
      finalizeNode,
    ],
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (connectingRef.current) return;
    connectingRef.current = true;
    setConnectionStatus("connecting");
    setConnectionError(null);

    // Close previous socket if any (cleanup before new connect)
    const prev = wsRef.current;
    if (prev && prev.readyState !== WebSocket.CLOSED) {
      try { prev.close(1000, "Reconnecting"); } catch { /* ignore */ }
    }
    // 注意：不在这里把 wsRef 置 null，让 disconnect cleanup 来处理，
    // 避免 connect 的 close 回调里对 null wsRef 做操作。

    const url = new URL(WS_URL);
    url.pathname = "/api/ws/chat";
    url.searchParams.set("sessionId", sessionId);

    // JWT 通过 Sec-WebSocket-Protocol 子协议头传递，
    // 避免 token 出现在 URL query 中被代理/浏览器历史泄露。
    const wsUrl = url.toString();
    const ws = new WebSocket(wsUrl, token ? [token] : []);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      if (!mountedRef.current) return;
      connectingRef.current = false;
      setConnectionStatus("connected");
      setWebSocket(ws);
      reconnectAttemptsRef.current = 0;
      clearReconnect();
      onConnect?.();
    });

    ws.addEventListener("message", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data as string) as IncomingMessage;
        handleIncoming(sessionId, data);
      } catch {
        onError?.("Invalid message format");
      }
    });

    ws.addEventListener("error", () => {
      if (!mountedRef.current) return;
      const errorMsg = "WebSocket connection error";
      setConnectionError(errorMsg);
      setConnectionStatus("error");
      onError?.(errorMsg);
    });

    ws.addEventListener("close", (event) => {
      if (!mountedRef.current) return;
      connectingRef.current = false;
      setConnectionStatus("disconnected");
      setWebSocket(null);
      onDisconnect?.();

      if (
        reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS &&
        event.code !== 4001 &&
        event.code !== 1008
      ) {
        const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    });
  }, [
    sessionId,
    token,
    clearReconnect,
    onConnect,
    onDisconnect,
    onError,
    setConnectionStatus,
    setConnectionError,
    setWebSocket,
    handleIncoming,
  ]);

  const disconnect = useCallback(() => {
    clearReconnect();
    const ws = wsRef.current;
    if (ws) {
      // 只在已连接时主动关闭；CONNECTING 状态的 socket 关闭会触发
      // "WebSocket is closed before the connection is established" 错误，
      // 让它自然走到 close 事件即可。
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try { ws.close(1000, "Client disconnecting"); } catch { /* already closed */ }
      }
      wsRef.current = null;
    }
    setWebSocket(null);
    setConnectionStatus("idle");
  }, [clearReconnect, setWebSocket, setConnectionStatus]);

  const sendChat = useCallback(
    (prompt: string, agentType: "PI" | "GROK" = "PI", thinkingLevel: "off" | "low" | "medium" | "high" = "off", workingDirectory?: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        onError?.("WebSocket is not connected");
        return;
      }

      const requestId = crypto.randomUUID();
      activeRequestIdRef.current = requestId;

      // 1. 立即把 USER 消息写进列表
      const userMessage: ChatMessage = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        role: "user",
        content: prompt,
        status: "completed",
        createdAt: new Date(),
      };
      appendMessage(sessionId, userMessage);

      // 2. 准备 assistant 占位（仅写 streamingBySession；done 后才落库到 messagesBySession，避免 key 冲突）
      const placeholder: ChatMessage = {
        id: requestId,
        sessionId,
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: new Date(),
      };
      setStreaming(sessionId, placeholder);
      registerActiveRequest(sessionId, requestId);

      // 重置首 token 标记，进入缓冲等待状态
      firstTokenRef.current = true;
      setBuffering(true);

      // 3. 发往 WS
      const message: unknown = {
        type: "chat",
        payload: { sessionId, agentType, prompt, thinkingLevel, workingDirectory },
      };
      ws.send(JSON.stringify(message));
      forceTick((n) => n + 1);
    },
    [sessionId, appendMessage, setStreaming, registerActiveRequest, onError],
  );

  const stopGeneration = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const currentActive = activeRequests.find((r) => r.sessionId === sessionId);
    const requestId = currentActive?.requestId ?? activeRequestIdRef.current;
    if (!requestId) return;

    const message: unknown = {
      type: "stop",
      payload: { requestId },
    };
    ws.send(JSON.stringify(message));
    unregisterActiveRequest(requestId);
    activeRequestIdRef.current = null;
  }, [sessionId, activeRequests, unregisterActiveRequest]);

  useEffect(() => {
    mountedRef.current = true;
    if (autoConnect) connect();
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [autoConnect]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connectionStatus,
    connectionError,
    messages,
    streamingMessage,
    isGenerating,
    buffering,
    currentRequestId: activeRequestIdRef.current,
    sendChat,
    stopGeneration,
    connect,
    disconnect,
  };
}
