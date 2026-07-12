/** Stub: Chat store */
import { create } from "zustand";

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
