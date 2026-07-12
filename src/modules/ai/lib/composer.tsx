/** Stub: AI composer */
import type { ReactNode } from "react";

export function AiComposerProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useComposer() {
  return {
    input: "",
    setInput: () => {},
    submit: () => {},
    isStreaming: false,
  };
}
