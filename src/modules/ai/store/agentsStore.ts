/** Stub: Agents store */
import { create } from "zustand";

type AgentsStoreStub = {
  agents: never[];
};

export const useAgentsStore = create<AgentsStoreStub>()(() => ({
  agents: [],
}));

export function newAgentId(): string {
  return `agent-${Date.now().toString(36)}`;
}
