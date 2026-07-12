/**
 * ACP Store — manages agent configurations, connections, and chat sessions.
 *
 * Performance optimizations:
 * - Fine-grained selector hooks to minimize re-renders
 * - Precise session updates (only mutate the affected session object)
 */

import { create } from "zustand";
import type {
  AgentConfig,
  AcpEvent,
  AcpMessage,
  NewSessionResult,
  WorkspaceRoot,
} from "@/lib/acp";
import {
  acpSetConfigs,
  acpConnect,
  acpDisconnect,
  acpNewSession,
  acpPrompt,
  acpCancel,
  acpConnectedAgents,
  onAcpEvent,
} from "@/lib/acp";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  agentName: string;
  sessionId: string;
  messages: ChatMessage[];
  isLoading: boolean;
  stopReason?: string;
}

export interface AcpStore {
  // Agent configuration
  agents: AgentConfig[];
  setAgents: (agents: AgentConfig[]) => void;

  // Connection state
  connectedAgents: string[];
  connecting: string | null;

  // Sessions
  sessions: ChatSession[];
  activeSessionIdx: number;

  // Actions
  connect: (agentName: string, roots: WorkspaceRoot[]) => Promise<void>;
  disconnect: (agentName: string) => Promise<void>;
  newSession: (agentName: string, model?: string) => Promise<string>;
  sendMessage: (sessionIdx: number, content: string) => Promise<void>;
  cancelTurn: (sessionIdx: number) => Promise<void>;
  removeSession: (sessionIdx: number) => void;
  setActiveSession: (idx: number) => void;

  // Event handling
  handleEvent: (event: AcpEvent) => void;

  // Init
  init: () => Promise<() => void>;
}

let msgIdCounter = 0;
function nextMsgId(): string {
  return `msg-${Date.now()}-${++msgIdCounter}`;
}

// ─── Helper: update a single session by index without recreating the whole array ─

function updateSessionAt(
  sessions: ChatSession[],
  idx: number,
  updater: (session: ChatSession) => ChatSession,
): ChatSession[] {
  const updated = sessions.slice();
  updated[idx] = updater(sessions[idx]);
  return updated;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAcpStore = create<AcpStore>((set, get) => ({
  agents: [],
  connectedAgents: [],
  connecting: null,
  sessions: [],
  activeSessionIdx: -1,

  setAgents: (agents) => {
    set({ agents });
    void acpSetConfigs(agents);
  },

  connect: async (agentName, roots) => {
    set({ connecting: agentName });
    try {
      await acpConnect(agentName, roots);
      // connected event will update connectedAgents via handleEvent
    } catch (e) {
      console.error("[acp] connect failed:", e);
      set({ connecting: null });
      throw e;
    }
  },

  disconnect: async (agentName) => {
    await acpDisconnect(agentName);
    set((s) => ({
      connectedAgents: s.connectedAgents.filter((n) => n !== agentName),
    }));
  },

  newSession: async (agentName, model) => {
    const result: NewSessionResult = await acpNewSession(agentName, model);
    const session: ChatSession = {
      id: `session-${Date.now()}`,
      agentName,
      sessionId: result.sessionId,
      messages: [],
      isLoading: false,
    };
    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionIdx: s.sessions.length,
    }));
    return session.id;
  },

  sendMessage: async (sessionIdx, content) => {
    const { sessions } = get();
    const session = sessions[sessionIdx];
    if (!session) return;

    const userMsg: ChatMessage = {
      id: nextMsgId(),
      role: "user",
      content,
      timestamp: Date.now(),
    };

    // Precise update: only replace the target session
    set({
      sessions: updateSessionAt(sessions, sessionIdx, (s) => ({
        ...s,
        messages: [...s.messages, userMsg],
        isLoading: true,
        stopReason: undefined,
      })),
    });

    try {
      await acpPrompt(session.agentName, session.sessionId, content);
    } catch (e) {
      // Mark as not loading on error — precise update
      const current = get().sessions;
      if (current[sessionIdx]) {
        set({
          sessions: updateSessionAt(current, sessionIdx, (s) => ({
            ...s,
            isLoading: false,
          })),
        });
      }
      throw e;
    }
  },

  cancelTurn: async (sessionIdx) => {
    const session = get().sessions[sessionIdx];
    if (!session) return;
    await acpCancel(session.agentName, session.sessionId);
  },

  removeSession: (sessionIdx) => {
    set((s) => {
      const sessions = s.sessions.filter((_, i) => i !== sessionIdx);
      let activeIdx = s.activeSessionIdx;
      if (activeIdx >= sessions.length) activeIdx = sessions.length - 1;
      return { sessions, activeSessionIdx: activeIdx };
    });
  },

  setActiveSession: (idx) => set({ activeSessionIdx: idx }),

  handleEvent: (event) => {
    switch (event.kind) {
      case "agent_connected":
        set((s) => ({
          connectedAgents: [...new Set([...s.connectedAgents, event.agent_name])],
          connecting: s.connecting === event.agent_name ? null : s.connecting,
        }));
        break;

      case "agent_disconnected":
        set((s) => ({
          connectedAgents: s.connectedAgents.filter((n) => n !== event.agent_name),
        }));
        break;

      case "session_update": {
        set((s) => {
          const idx = s.sessions.findIndex(
            (sess) =>
              sess.agentName === event.agent_name &&
              sess.sessionId === event.session_id,
          );
          if (idx < 0) return s;

          return {
            sessions: updateSessionAt(s.sessions, idx, (session) => {
              let newMessages = session.messages;

              // Append assistant messages
              if (event.messages) {
                const incoming: ChatMessage[] = [];
                for (const msg of event.messages) {
                  const text =
                    typeof msg.content === "string"
                      ? msg.content
                      : msg.content.map((p) => p.text).join("");
                  incoming.push({
                    id: nextMsgId(),
                    role: msg.role,
                    content: text,
                    timestamp: Date.now(),
                  });
                }
                newMessages = [...session.messages, ...incoming];
              }

              return {
                ...session,
                messages: newMessages,
                // Mark done if stop_reason present
                isLoading: event.stop_reason ? false : session.isLoading,
                stopReason: event.stop_reason ?? session.stopReason,
              };
            }),
          };
        });
        break;
      }

      case "permission_request":
        // TODO: Show permission dialog to user
        console.warn("[acp] permission request:", event.description);
        break;

      case "error":
        console.error(`[acp] error from ${event.agent_name}:`, event.message);
        break;
    }
  },

  init: async () => {
    // Sync connected agents from backend
    try {
      const connected = await acpConnectedAgents();
      set({ connectedAgents: connected });
    } catch {
      // Backend not ready yet
    }

    // Listen for events
    const unlisten = await onAcpEvent((event) => {
      get().handleEvent(event);
    });

    return unlisten;
  },
}));

// ─── Selector Hooks (fine-grained subscriptions) ─────────────────────────────

/** Subscribe only to the active session object */
export function useActiveSession(): ChatSession | null {
  return useAcpStore((s) =>
    s.activeSessionIdx >= 0 ? s.sessions[s.activeSessionIdx] ?? null : null,
  );
}

/** Subscribe only to the messages array of the active session */
export function useActiveSessionMessages(): ChatMessage[] {
  return useAcpStore((s) => {
    const session =
      s.activeSessionIdx >= 0 ? s.sessions[s.activeSessionIdx] : null;
    return session?.messages ?? [];
  });
}

/** Subscribe only to connection-related state */
export function useAcpConnection() {
  return useAcpStore((s) => ({
    agents: s.agents,
    connectedAgents: s.connectedAgents,
    connecting: s.connecting,
  }));
}

/** Subscribe only to session list metadata (not full message arrays) */
export function useSessionList() {
  return useAcpStore((s) => ({
    count: s.sessions.length,
    activeIdx: s.activeSessionIdx,
    sessions: s.sessions.map((sess) => ({
      id: sess.id,
      agentName: sess.agentName,
      messageCount: sess.messages.length,
      isLoading: sess.isLoading,
    })),
  }));
}
