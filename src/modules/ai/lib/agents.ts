/** Stub: AI agents lib */

export type AgentConfig = {
  id: string;
  name: string;
  prompt: string;
};

export function loadAgents(): AgentConfig[] {
  return [];
}

export function saveAgent(_agent: AgentConfig): void {}
export function deleteAgent(_id: string): void {}
