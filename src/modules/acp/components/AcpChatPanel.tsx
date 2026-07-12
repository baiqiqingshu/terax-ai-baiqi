/**
 * AcpChatPanel — Main chat interface for ACP agent interaction.
 * Features:
 * - Drag & drop files/folders into input → auto-converts to path
 * - Multi-line resizable input textarea
 * - Session history viewing
 * - Streaming message display
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAcpStore } from "../store";

export function AcpChatPanel() {
  const {
    sessions,
    activeSessionIdx,
    sendMessage,
    cancelTurn,
  } = useAcpStore();

  const session = sessions[activeSessionIdx] ?? null;
  const [input, setInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length]);

  // Focus input on session change
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionIdx]);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || activeSessionIdx < 0) return;
    setInput("");
    try {
      await sendMessage(activeSessionIdx, trimmed);
    } catch (e) {
      console.error("[acp-chat] send failed:", e);
    }
  }, [input, activeSessionIdx, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleCancel = useCallback(() => {
    if (activeSessionIdx >= 0) {
      void cancelTurn(activeSessionIdx);
    }
  }, [activeSessionIdx, cancelTurn]);

  // ─── Drag & Drop: files/folders → path insertion ───────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const items = e.dataTransfer?.items;
      if (!items) return;

      const paths: string[] = [];

      // Try to get file paths from dataTransfer
      // In Tauri, dropped files give us their full path
      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Tauri provides full path via webkitRelativePath or path property
        const path = (file as File & { path?: string }).path ?? file.name;
        if (path) paths.push(path);
      }

      // Also check for text/uri-list or text/plain (drag from explorer)
      if (paths.length === 0) {
        const text = e.dataTransfer.getData("text/plain");
        if (text) {
          // Could be file paths separated by newlines
          const lines = text.split("\n").filter((l) => l.trim());
          paths.push(...lines);
        }
      }

      if (paths.length > 0) {
        const insertion = paths.map((p) => `\`${p}\``).join(" ");
        setInput((prev) => {
          const cursor = inputRef.current?.selectionStart ?? prev.length;
          const before = prev.slice(0, cursor);
          const after = prev.slice(cursor);
          const spaceBefore = before && !before.endsWith(" ") ? " " : "";
          const spaceAfter = after && !after.startsWith(" ") ? " " : "";
          return `${before}${spaceBefore}${insertion}${spaceAfter}${after}`;
        });
        inputRef.current?.focus();
      }
    },
    [],
  );

  // ─── No active session ─────────────────────────────────────────────────────

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-sm">选择或创建一个 Agent 会话开始对话</p>
          <p className="text-xs opacity-70">
            支持拖放文件或文件夹到输入框，自动转为路径
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {session.messages.length === 0 && !session.isLoading && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground/70">
              与 {session.agentName} 的会话已就绪
            </p>
          </div>
        )}

        {session.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {session.isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-1">
                <span className="animate-bounce [animation-delay:0ms]">·</span>
                <span className="animate-bounce [animation-delay:150ms]">·</span>
                <span className="animate-bounce [animation-delay:300ms]">·</span>
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area with drag & drop support */}
      <div
        className={`border-t border-border px-3 py-2 transition-colors ${
          isDragOver ? "bg-primary/5 border-primary/50" : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="mb-2 rounded border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-center text-xs text-primary">
            松开以插入文件路径
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息… (Enter 发送, Shift+Enter 换行, 拖放文件插入路径)"
            rows={3}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none resize-y focus:ring-1 focus:ring-ring"
            style={{ minHeight: "72px", maxHeight: "200px" }}
            disabled={session.isLoading}
          />
          <div className="flex flex-col gap-1">
            {session.isLoading ? (
              <button
                onClick={handleCancel}
                className="rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground hover:bg-destructive/90"
                title="取消当前请求"
              >
                ■
              </button>
            ) : (
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim()}
                className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                title="发送 (Enter)"
              >
                ↑
              </button>
            )}
          </div>
        </div>
        {session.stopReason && (
          <p className="mt-1 text-xs text-muted-foreground">
            ✓ 完成 ({session.stopReason})
          </p>
        )}
      </div>
    </div>
  );
}
