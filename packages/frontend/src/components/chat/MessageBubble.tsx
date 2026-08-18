/**
 * NZi Agent Web — MessageBubble
 *
 * 职责：
 * - 区分渲染 User / Assistant / Tool 消息
 * - 预留 Markdown 渲染插槽，当前先用普通文本
 *
 * 设计约定：
 * - User：靠右，蓝色系
 * - Assistant：靠左，灰色系
 * - Tool：靠左，黄色系，带 icon 标记
 */

"use client";

export interface MessageBubbleProps {
  role: "user" | "assistant" | "tool_result";
  content: string;
  reasoning?: string;
  /** 消息状态，不同状态可改变 UI 样式 */
  status?: "streaming" | "completed" | "interrupted" | "error";
  /** 是否显示 reasoning 折叠区（预留） */
  showReasoning?: boolean;
}

export default function MessageBubble({
  role,
  content,
  reasoning,
  status = "completed",
  showReasoning = false,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const isStreaming = status === "streaming";

  const bubbleClass = [
    "message-bubble",
    isUser ? "message-bubble--user" : "message-bubble--assistant",
    isStreaming ? "message-bubble--streaming" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const statusIndicator = (() => {
    switch (status) {
      case "streaming":
        return (
          <span className="message-status" data-status="streaming">
            <span className="message-status__dot" />
            生成中...
          </span>
        );
      case "interrupted":
        return (
          <span className="message-status" data-status="interrupted">
            已中断
          </span>
        );
      case "error":
        return (
          <span className="message-status" data-status="error">
            出错
          </span>
        );
      default:
        return null;
    }
  })();

  return (
    <div className={`message-row ${isUser ? "message-row--user" : "message-row--assistant"}`}>
      <div className={bubbleClass}>
        <div className="message-bubble__header">
          <span className="message-bubble__role">
            {isUser ? "你" : "Agent"}
          </span>
          {statusIndicator}
        </div>
        <div className="message-bubble__body">
          {/* Markdown 渲染预留插槽 */}
          {content}
          {isStreaming && <span className="message-bubble__cursor" />}
        </div>
        {showReasoning && reasoning && (
          <details className="message-bubble__reasoning">
            <summary>思维过程</summary>
            <pre className="message-bubble__reasoning-text">{reasoning}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
