/** Stub: Snippets store */
import { create } from "zustand";

type SnippetsStoreStub = {
  snippets: never[];
};

export const useSnippetsStore = create<SnippetsStoreStub>()(() => ({
  snippets: [],
}));
