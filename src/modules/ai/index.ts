/**
 * AI Module Stub
 * This module has been gutted. Real AI capabilities will be re-introduced via ACP.
 * These stubs exist solely to keep the frontend compilable during the transition.
 */

import { create } from "zustand";

// ─── Stub Components ─────────────────────────────────────────────────────────

export const AgentRunBridge = () => null;
export const AiMiniWindow = () => null;
export const LocalAgentNotificationsBridge = () => null;
export const SelectionAskAi = () => null;
export const AiInputBarConnect = () => null;

// ─── Stub Hooks ──────────────────────────────────────────────────────────────

export function useAiBootstrap() {}
export function useAiLiveBridge() {}
export function useSelectionAskAi() {
  return { active: false, start: () => {}, stop: () => {} };
}

// ─── Stub Store ──────────────────────────────────────────────────────────────

type ChatStoreStub = {
  isAgentRunning: boolean;
  messages: never[];
  abort: () => void;
};

export const useChatStore = create<ChatStoreStub>()(() => ({
  isAgentRunning: false,
  messages: [],
  abort: () => {},
}));
