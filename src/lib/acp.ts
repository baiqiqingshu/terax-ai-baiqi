/**
 * ACP (Agent Client Protocol) frontend interface.
 * Provides typed wrappers around Tauri invoke calls for agent management.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TransportKind = "stdio" | "http";

export interface AgentConfig {
  name: string;
  transport?: TransportKind;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface WorkspaceRoot {
  uri: string;
  name?: string;
}

export interface NewSessionResult {
  sessionId: string;
  models?: ModelInfo[];
}

export interface ModelInfo {
  id: string;
  name?: string;
}

export interface AcpMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
}

export interface ContentPart {
  type: "text";
  text: string;
}

export type AcpEvent =
  | {
      kind: "agent_connected";
      agent_name: string;
      agent_info?: { name: string; version?: string };
    }
  | {
      kind: "agent_disconnected";
      agent_name: string;
      reason: string;
    }
  | {
      kind: "session_update";
      agent_name: string;
      session_id: string;
      messages?: AcpMessage[];
      stop_reason?: string;
    }
  | {
      kind: "permission_request";
      agent_name: string;
      session_id: string;
      permission_id: string;
      description: string;
    }
  | {
      kind: "error";
      agent_name: string;
      message: string;
    };

// ─── Invoke Wrappers ─────────────────────────────────────────────────────────

/** Update the list of available agent configurations */
export function acpSetConfigs(configs: AgentConfig[]): Promise<void> {
  return invoke("acp_set_configs", { configs });
}

/** Get the current agent configurations */
export function acpGetConfigs(): Promise<AgentConfig[]> {
  return invoke("acp_get_configs");
}

/** Connect to an agent (spawns process + initialize handshake) */
export function acpConnect(
  agentName: string,
  workspaceRoots: WorkspaceRoot[],
): Promise<void> {
  return invoke("acp_connect", { agentName, workspaceRoots });
}

/** Disconnect an agent (kills process) */
export function acpDisconnect(agentName: string): Promise<void> {
  return invoke("acp_disconnect", { agentName });
}

/** Create a new session with a connected agent */
export function acpNewSession(
  agentName: string,
  model?: string,
): Promise<NewSessionResult> {
  return invoke("acp_new_session", { agentName, model });
}

/** Send a prompt to an active session */
export function acpPrompt(
  agentName: string,
  sessionId: string,
  content: string,
): Promise<void> {
  return invoke("acp_prompt", { agentName, sessionId, content });
}

/** Cancel an ongoing prompt turn */
export function acpCancel(
  agentName: string,
  sessionId: string,
): Promise<void> {
  return invoke("acp_cancel", { agentName, sessionId });
}

/** List currently connected agent names */
export function acpConnectedAgents(): Promise<string[]> {
  return invoke("acp_connected_agents");
}

/** Check if a specific agent is connected */
export function acpIsConnected(agentName: string): Promise<boolean> {
  return invoke("acp_is_connected", { agentName });
}

// ─── Event Listener ──────────────────────────────────────────────────────────

/** Subscribe to ACP events (session updates, connections, etc) */
export function onAcpEvent(
  callback: (event: AcpEvent) => void,
): Promise<UnlistenFn> {
  return listen<AcpEvent>("acp-event", (ev) => {
    callback(ev.payload);
  });
}
