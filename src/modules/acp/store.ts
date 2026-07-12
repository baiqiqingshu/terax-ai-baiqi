/**
 * ACP Store — manages agent configurations, connections, and chat sessions.
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
    const sessions = [...get().sessions];
    const session = sessions[sessionIdx];
    if (!session) return;

    const userMsg: ChatMessage = {
      id: nextMsgId(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    session.messages = [...session.messages, userMsg];
    session.isLoading = true;
    session.stopReason = undefined;
    set({ sessions: [...sessions] });

    try {
      await acpPrompt(session.agentName, session.sessionId, content);
    } catch (e) {
      // Mark as not loading on error
      const updated = [...get().sessions];
      if (updated[sessionIdx]) {
        updated[sessionIdx] = { ...updated[sessionIdx], isLoading: false };
        set({ sessions: updated });
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
          const sessions = [...s.sessions];
          const idx = sessions.findIndex(
            (sess) =>
              sess.agentName === event.agent_name &&
              sess.sessionId === event.session_id,
          );
          if (idx < 0) return s;

          const session = { ...sessions[idx] };

          // Append assistant messages
          if (event.messages) {
            for (const msg of event.messages) {
              const text =
                typeof msg.content === "string"
                  ? msg.content
                  : msg.content.map((p) => p.text).join("");
              session.messages = [
                ...session.messages,
                {
                  id: nextMsgId(),
                  role: msg.role,
                  content: text,
                  timestamp: Date.now(),
                },
              ];
            }
          }

          // Mark done if stop_reason present
          if (event.stop_reason) {
            session.isLoading = false;
            session.stopReason = event.stop_reason;
          }

          sessions[idx] = session;
          return { sessions };
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
