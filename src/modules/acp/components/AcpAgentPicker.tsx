/**
 * AcpAgentPicker — Agent selection and connection management UI.
 * Shows available agents, connection status, and session creation.
 *
 * Optimized: uses fine-grained store selectors to avoid re-rendering
 * when unrelated state (e.g. message content) changes.
 */

import { useCallback, useState } from "react";
import { useAcpStore, useSessionList } from "../store";
import type { AgentConfig, WorkspaceRoot } from "@/lib/acp";

interface Props {
  /** Current workspace root for ACP context */
  workspaceRoot?: string | null;
}

export function AcpAgentPicker({ workspaceRoot }: Props) {
  // Fine-grained subscriptions — only re-render when these specific slices change
  const agents = useAcpStore((s) => s.agents);
  const connectedAgents = useAcpStore((s) => s.connectedAgents);
  const connecting = useAcpStore((s) => s.connecting);
  const connect = useAcpStore((s) => s.connect);
  const disconnect = useAcpStore((s) => s.disconnect);
  const newSession = useAcpStore((s) => s.newSession);
  const setActiveSession = useAcpStore((s) => s.setActiveSession);
  const removeSession = useAcpStore((s) => s.removeSession);

  // Session list metadata (doesn't include full message arrays)
  const { sessions, activeIdx } = useSessionList();

  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(
    async (agent: AgentConfig) => {
      setError(null);
      const roots: WorkspaceRoot[] = workspaceRoot
        ? [{ uri: `file:///${workspaceRoot.replace(/\\/g, "/")}`, name: workspaceRoot.split(/[\\/]/).pop() }]
        : [];
      try {
        await connect(agent.name, roots);
      } catch (e) {
        setError(String(e));
      }
    },
    [connect, workspaceRoot],
  );

  const handleNewSession = useCallback(
    async (agentName: string) => {
      setError(null);
      try {
        await newSession(agentName);
      } catch (e) {
        setError(String(e));
      }
    },
    [newSession],
  );

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      {/* Agent list */}
      <div>
        <h3 className="mb-2 font-medium text-foreground">可用 Agents</h3>
        {agents.length === 0 && (
          <p className="text-xs text-muted-foreground">
            未配置任何 Agent。在设置中添加 ACP agent 配置。
          </p>
        )}
        <div className="space-y-1">
          {agents.map((agent) => {
            const isConnected = connectedAgents.includes(agent.name);
            const isConnecting = connecting === agent.name;
            return (
              <div
                key={agent.name}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isConnected
                        ? "bg-green-500"
                        : isConnecting
                          ? "bg-yellow-500 animate-pulse"
                          : "bg-muted-foreground/30"
                    }`}
                  />
                  <span className="font-medium">{agent.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {agent.transport ?? (agent.command ? "stdio" : "http")}
                  </span>
                </div>
                <div className="flex gap-1">
                  {isConnected ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleNewSession(agent.name)}
                        className="rounded px-2 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20"
                      >
                        新会话
                      </button>
                      <button
                        type="button"
                        onClick={() => void disconnect(agent.name)}
                        className="rounded px-2 py-1 text-xs bg-destructive/10 text-destructive hover:bg-destructive/20"
                      >
                        断开
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleConnect(agent)}
                      disabled={isConnecting}
                      className="rounded px-2 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                    >
                      {isConnecting ? "连接中…" : "连接"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Session tabs */}
      {sessions.length > 0 && (
        <div>
          <h3 className="mb-2 font-medium text-foreground">会话</h3>
          <div className="space-y-1">
            {sessions.map((sess, idx) => (
              <div
                key={sess.id}
                onClick={() => setActiveSession(idx)}
                className={`flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer ${
                  idx === activeIdx
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{sess.agentName}</span>
                  <span className="text-xs text-muted-foreground">
                    {sess.messageCount} 条消息
                  </span>
                  {sess.isLoading && (
                    <span className="text-xs text-yellow-600 animate-pulse">
                      处理中
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSession(idx);
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
