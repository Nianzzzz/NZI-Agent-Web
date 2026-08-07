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
  readonly currentRequestId: string | null;
  readonly sendChat: (prompt: string, agentType?: "PI" | "GROK") => void;
  readonly stopGeneration: () => void;
  readonly connect: () => void;
  readonly disconnect: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000").replace(/^http/, "ws");

type IncomingMessage =
  | { type: "chunk"; payload: { requestId?: string; delta: string; reasoning?: boolean } }
  | { type: "node"; payload: { requestId?: string; node: TimelineNode } }
  | { type: "done"; payload: { requestId?: string; content: string; latencyMs?: number } }
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
            });
          }
          forceTick((n) => n + 1);
          break;
        }
        case "chunk": {
          const delta = data.payload?.delta ?? "";
          if (!delta) return;
          updateStreamingContent(sessionIdLocal, delta);
          forceTick((n) => n + 1);
          break;
        }
        case "done": {
          const finalContent = data.payload?.content ?? "";
          const reqId = data.payload?.requestId ?? activeRequestIdRef.current;
          if (reqId) {
            completeStreaming(sessionIdLocal, {
              id: reqId,
              sessionId: sessionIdLocal,
              role: "assistant",
              content: finalContent,
              status: "completed",
              createdAt: new Date(),
              latencyMs: data.payload?.latencyMs,
            });
          }
          activeRequestIdRef.current = null;
          forceTick((n) => n + 1);
          break;
        }
        case "error": {
          const message = data.payload?.message ?? "Unknown error";
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

    const url = new URL(WS_URL);
    url.pathname = "/api/ws/chat";
    if (token) {
      url.searchParams.set("token", token);
    }
    url.searchParams.set("sessionId", sessionId);

    const ws = new WebSocket(url.toString());
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
      ws.close(1000, "Client disconnecting");
      wsRef.current = null;
    }
    setWebSocket(null);
    setConnectionStatus("idle");
  }, [clearReconnect, setWebSocket, setConnectionStatus]);

  const sendChat = useCallback(
    (prompt: string, agentType: "PI" | "GROK" = "PI") => {
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

      // 3. 发往 WS
      const message: unknown = {
        type: "chat",
        payload: { sessionId, agentType, prompt },
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
    currentRequestId: activeRequestIdRef.current,
    sendChat,
    stopGeneration,
    connect,
    disconnect,
  };
}
