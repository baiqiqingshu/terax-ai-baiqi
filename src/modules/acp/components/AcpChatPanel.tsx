/**
 * AcpChatPanel — Main chat interface for ACP agent interaction.
 * Performance-optimized for long conversations:
 * - Virtualized message list (@tanstack/react-virtual)
 * - Auto stick-to-bottom (use-stick-to-bottom)
 * - Memoized message bubbles
 * - Drag & drop files/folders into input → auto-converts to path
 * - Multi-line resizable input textarea
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAcpStore } from "../store";
import { MessageBubble } from "./MessageBubble";

export function AcpChatPanel() {
  const activeSessionIdx = useAcpStore((s) => s.activeSessionIdx);
  const session = useAcpStore(
    (s) => (s.activeSessionIdx >= 0 ? s.sessions[s.activeSessionIdx] : null),
  );
  const sendMessage = useAcpStore((s) => s.sendMessage);
  const cancelTurn = useAcpStore((s) => s.cancelTurn);

  const [input, setInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isStuckRef = useRef(true);

  const messages = session?.messages ?? [];

  // ─── Virtualizer ────────────────────────────────────────────────────────────

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60, // estimated row height
    overscan: 10,
  });

  // ─── Auto stick-to-bottom ──────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Track if user is at bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 40;
    isStuckRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll when new messages arrive (only if stuck to bottom)
  const prevMsgCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && isStuckRef.current) {
      // Use requestAnimationFrame for smooth scroll after DOM update
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  // Also scroll when loading state changes (streaming done)
  useEffect(() => {
    if (isStuckRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [session?.isLoading, scrollToBottom]);

  // Focus input on session change
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionIdx]);

  // ─── Auto-resize textarea ──────────────────────────────────────────────────

  const adjustTextareaHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // ─── Send / Cancel ─────────────────────────────────────────────────────────

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

  // ─── Scroll to bottom button ───────────────────────────────────────────────

  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const handleScrollForBtn = useCallback(() => {
    handleScroll();
    setShowScrollBtn(!isStuckRef.current);
  }, [handleScroll]);

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

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col">
      {/* Messages area — virtualized */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScrollForBtn}
          className="absolute inset-0 overflow-y-auto px-3 py-2"
        >
          {messages.length === 0 && !session.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-xs text-muted-foreground/70">
                与 {session.agentName} 的会话已就绪
              </p>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualItems.map((virtualRow) => {
                const msg = messages[virtualRow.index];
                return (
                  <div
                    key={msg.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="py-1">
                      <MessageBubble message={msg} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Loading indicator */}
          {session.isLoading && (
            <div className="flex justify-start py-1">
              <div className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1">
                  <span className="animate-bounce [animation-delay:0ms]">·</span>
                  <span className="animate-bounce [animation-delay:150ms]">·</span>
                  <span className="animate-bounce [animation-delay:300ms]">·</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/90 border border-border shadow-md px-3 py-1 text-xs text-muted-foreground hover:text-foreground backdrop-blur transition-colors"
          >
            ↓ 回到底部
          </button>
        )}
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
                type="button"
                onClick={handleCancel}
                className="rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground hover:bg-destructive/90"
                title="取消当前请求"
              >
                ■
              </button>
            ) : (
              <button
                type="button"
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
