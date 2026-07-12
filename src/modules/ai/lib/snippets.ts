/** Stub: AI snippets lib */

export type Snippet = {
  id: string;
  name: string;
  content: string;
};

export function loadSnippets(): Snippet[] {
  return [];
}

export function saveSnippet(_snippet: Snippet): void {}
export function deleteSnippet(_id: string): void {}
