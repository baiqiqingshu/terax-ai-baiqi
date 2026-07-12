/**
 * AcpHistory — View historical sessions from Codex CLI and Claude Code.
 *
 * Codex CLI stores history at: ~/.codex/history/
 * Claude Code stores history at: ~/.claude/projects/<project>/history/
 *
 * Both use JSONL format with messages.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HistorySession {
  id: string;
  agent: "codex" | "claude-code";
  timestamp: number;
  preview: string;
  filePath: string;
  messages?: HistoryMessage[];
}

export interface HistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  /** If provided, filter to sessions from this project path */
  projectRoot?: string | null;
  /** Called when user selects a session to view detail */
  onSelectSession?: (session: HistorySession) => void;
}

export function AcpHistory({ projectRoot, onSelectSession }: Props) {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistorySession | null>(null);

  // Load history sessions from backend
  useEffect(() => {
    setLoading(true);
    setError(null);
    invoke<HistorySession[]>("acp_load_history", { projectRoot })
      .then((result) => {
        setSessions(result);
      })
      .catch((e) => {
        setError(String(e));
        // Fallback: try to scan locally
        setSessions([]);
      })
      .finally(() => setLoading(false));
  }, [projectRoot]);

  const handleSelect = useCallback(
    (session: HistorySession) => {
      setSelectedId(session.id);
      // Load full session messages
      invoke<HistorySession>("acp_load_history_detail", {
        filePath: session.filePath,
        agent: session.agent,
      })
        .then((full) => {
          setDetail(full);
          onSelectSession?.(full);
        })
        .catch(() => {
          setDetail(session);
        });
    },
    [onSelectSession],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <span className="text-xs text-muted-foreground animate-pulse">
          加载历史会话…
        </span>
      </div>
    );
  }

  if (error && sessions.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        <p>无法加载历史: {error}</p>
        <p className="mt-1 opacity-70">
          确保 Codex CLI (~/.codex/) 或 Claude Code (~/.claude/) 目录存在
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground text-center">
            暂无历史会话
          </div>
        ) : (
          <div className="space-y-0.5 p-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => handleSelect(session)}
                className={`w-full text-left rounded-md px-3 py-2 text-xs transition-colors ${
                  selectedId === session.id
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        session.agent === "codex"
                          ? "bg-green-500"
                          : "bg-orange-500"
                      }`}
                    />
                    <span className="font-medium capitalize">
                      {session.agent === "claude-code" ? "Claude" : "Codex"}
                    </span>
                  </span>
                  <span className="text-[10px] opacity-60">
                    {formatTimestamp(session.timestamp)}
                  </span>
                </div>
                <p className="mt-0.5 truncate opacity-80">{session.preview}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail view */}
      {detail && detail.messages && detail.messages.length > 0 && (
        <div className="border-t border-border max-h-[50%] overflow-y-auto">
          <div className="p-2 space-y-2">
            {detail.messages.map((msg, i) => (
              <div
                key={`${detail.id}-${i}`}
                className={`rounded-md px-2 py-1.5 text-xs ${
                  msg.role === "user"
                    ? "bg-primary/10 text-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <span className="text-[10px] font-medium uppercase opacity-50">
                  {msg.role}
                </span>
                <p className="mt-0.5 whitespace-pre-wrap break-words">
                  {msg.content.length > 500
                    ? `${msg.content.slice(0, 500)}…`
                    : msg.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays}天前`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
