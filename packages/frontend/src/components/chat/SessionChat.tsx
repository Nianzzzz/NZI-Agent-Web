/**
 * NZi Agent Web — SessionChat
 *
 * 职责：
 * - 会话面板外壳：消息列表 + ChatInput 输入框
 * - 使用 useChatSocket 管理 WebSocket 生命周期
 * - 在用户发送消息时，将用户消息追加到列表；收到流式事件后更新 assistant 消息
 */

"use client";

import { useMemo, useState, useCallback } from "react";
import ChatInput from "./ChatInput";
import MessageBubble from "./MessageBubble";
import { useChatSocket } from "@/hooks/use-chat-socket";
import type { ChatMessage } from "@/stores/chat.store";

export interface SessionChatProps {
  sessionId: string;
  /** 可选：从外部传入 user（由 Auth 模块提供） */
  user?: { sub: string; email: string; tenantId: string; role: string } | null;
  /** 可选：JWT Token */
  token?: string | null;
}

export default function SessionChat({ sessionId, token }: SessionChatProps) {
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);

  const {
    connectionStatus,
    connectionError,
    messages,
    streamingMessage,
    sendChat,
    stopGeneration,
  } = useChatSocket({
    sessionId,
    token,
    autoConnect: true,
  });

  const handleSend = useCallback(
    (prompt: string) => {
      setCurrentPrompt(prompt);
      sendChat(prompt);
    },
    [sendChat],
  );

  // 将 streamingMessage 和 history 合并为一个平坦列表用于渲染
  const renderedMessages = useMemo(() => {
    const list: ChatMessage[] = [...messages];
    if (streamingMessage && streamingMessage.status === "streaming") {
      list.push(streamingMessage);
    }
    return list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [messages, streamingMessage]);

  return (
    <div className="session-chat">
      <header className="session-chat__header">
        <h2 className="session-chat__title">会话</h2>
        <span className="session-chat__session-id">{sessionId}</span>
        <span className="session-chat__status" data-status={connectionStatus}>
          {connectionStatus === "connected" && "已连接"}
          {connectionStatus === "connecting" && "连接中..."}
          {connectionStatus === "disconnected" && "已断开"}
          {connectionStatus === "error" && "连接失败"}
          {connectionStatus === "idle" && "未连接"}
        </span>
      </header>

      {connectionError && (
        <div className="session-chat__error-banner">
          {connectionError}
        </div>
      )}

      <div className="session-chat__messages">
        {renderedMessages.length === 0 && (
          <div className="session-chat__empty">
            开始新的对话
          </div>
        )}
        {renderedMessages.map((m) => (
          <MessageBubble
            key={m.id}
            role={m.role}
            content={m.content}
            reasoning={m.reasoning}
            status={m.status}
          />
        ))}
      </div>

      <ChatInput
        isGenerating={!!streamingMessage}
        onSubmit={handleSend}
        onStop={stopGeneration}
        disabled={connectionStatus !== "connected"}
      />
    </div>
  );
}
