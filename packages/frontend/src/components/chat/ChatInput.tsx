/**
 * NZi Agent Web — ChatInput
 *
 * 职责：
 * - 文本输入 + 发送按钮
 * - 正在生成（streaming）时显示"停止生成"按钮
 * - 使用组件内状态控制输入值（避免直接受控），对外暴露 onSubmit
 */

"use client";

import { useState, type KeyboardEvent } from "react";

export interface ChatInputProps {
  /** 是否正处于生成中 */
  isGenerating?: boolean;
  /** 发送处理 */
  onSubmit: (prompt: string) => void;
  /** 停止生成 */
  onStop?: () => void;
  /** 占位文本 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 发送按钮标签 */
  sendLabel?: string;
  /** 停止按钮标签 */
  stopLabel?: string;
}

export default function ChatInput({
  isGenerating = false,
  onSubmit,
  onStop,
  placeholder = "输入消息...",
  disabled = false,
  sendLabel = "发送",
  stopLabel = "停止生成",
}: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSend = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-wrapper">
      <div className="chat-input-box">
        <textarea
          className="chat-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
        {!isGenerating ? (
          <button
            type="button"
            className="chat-send-btn"
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            aria-label={sendLabel}
          >
            {sendLabel}
          </button>
        ) : (
          <button
            type="button"
            className="chat-stop-btn"
            onClick={onStop}
            aria-label={stopLabel}
          >
            {stopLabel}
          </button>
        )}
      </div>
      <p className="chat-input-hint">
        Enter 发送，Shift + Enter 换行
      </p>
    </div>
  );
}
