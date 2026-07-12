/**
 * AcpSidebarPanel — Sidebar container for ACP agent interaction.
 * Combines agent picker (top), history tab, and chat panel (bottom).
 * Supports auto-connect for fast agent startup.
 */

import { useCallback, useEffect, useState } from "react";
import { useAcpStore } from "../store";
import { AcpAgentPicker } from "./AcpAgentPicker";
import { AcpChatPanel } from "./AcpChatPanel";
import { AcpHistory } from "./AcpHistory";

interface Props {
  workspaceRoot?: string | null;
}

type TabId = "chat" | "history";

export function AcpSidebarPanel({ workspaceRoot }: Props) {
  const { sessions, activeSessionIdx, agents, connectedAgents, connect, init } =
    useAcpStore();

  const [tab, setTab] = useState<TabId>("chat");

  // Initialize event listener on mount
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    init().then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [init]);

  // Auto-connect: when panel opens, if there's an agent configured but not
  // connected, pre-connect it in the background for faster first prompt
  useEffect(() => {
    if (agents.length === 0 || !workspaceRoot) return;

    // Find first agent not yet connected
    const unconnected = agents.find(
      (a) => !connectedAgents.includes(a.name),
    );
    if (!unconnected) return;

    // Auto-connect in background (silent — no error toast)
    const roots = [
      {
        uri: `file:///${workspaceRoot.replace(/\\/g, "/")}`,
        name: workspaceRoot.split(/[\\/]/).pop(),
      },
    ];
    connect(unconnected.name, roots).catch(() => {
      // Silently fail — user can manually connect later
    });
  }, [agents, connectedAgents, connect, workspaceRoot]);

  const hasActiveSession = activeSessionIdx >= 0 && sessions[activeSessionIdx];

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-2 py-1">
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
          对话
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          历史
        </TabButton>
      </div>

      {tab === "chat" ? (
        <>
          {/* Agent picker — collapsible when a session is active */}
          <div
            className={`shrink-0 border-b border-border overflow-y-auto ${
              hasActiveSession ? "max-h-[180px]" : ""
            }`}
          >
            <AcpAgentPicker workspaceRoot={workspaceRoot} />
          </div>

          {/* Chat panel — fills remaining space */}
          <div className="min-h-0 flex-1">
            <AcpChatPanel />
          </div>
        </>
      ) : (
        /* History tab */
        <div className="min-h-0 flex-1">
          <AcpHistory projectRoot={workspaceRoot} />
        </div>
      )}
    </div>
  );
}

// ─── Tab button ──────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-foreground/[0.07] text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
      }`}
    >
      {children}
    </button>
  );
}
