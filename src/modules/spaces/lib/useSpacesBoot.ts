import { native } from "@/lib/native";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Tab } from "@/modules/tabs";
import { DEFAULT_SPACE_ID } from "@/modules/tabs/lib/useTabs";
import { isLeaf, type PaneNode } from "@/modules/terminal/lib/panes";
import { parseWorkspaceScopeKey, type WorkspaceEnv } from "@/modules/workspace";
import { useEffect, useRef, useState } from "react";
import { activeSpaceEnv, freshTabCwd } from "./activeSpace";
import { freshTerminalTab, hydrateTabs } from "./serialize";
import { loadAll, type SpaceMeta, saveActiveId, saveSpacesList } from "./store";
import { useSpaces } from "./useSpaces";

type Params = {
  ready: boolean;
  launchCwd: string | null;
  home: string | null;
  allocId: () => number;
  replaceTabs: (tabs: Tab[], activeId: number) => void;
  markBooted: () => void;
  setActiveSpaceForNewTabs: (id: string) => void;
  adoptWorkspaceEnv: (env: WorkspaceEnv) => Promise<string | null>;
};

function uniqueCwds(tabs: Tab[]): string[] {
  const set = new Set<string>();
  const walk = (n: PaneNode) => {
    if (isLeaf(n)) {
      if (n.cwd) set.add(n.cwd);
      return;
    }
    for (const c of n.children) walk(c);
  };
  for (const t of tabs) if (t.kind === "terminal") walk(t.paneTree);
  return [...set];
}

export type BootResult = {
  /** True when first launch with no previous sessions — show ProjectSelector */
  needsProjectSelector: boolean;
  /** Existing spaces loaded from disk (for ProjectSelector) */
  loadedSpaces: SpaceMeta[];
  /** Call this after the user picks a project from the selector */
  completeBootWithSpace: (space: SpaceMeta) => Promise<void>;
  /** Call this to boot without any project (bare terminal) */
  completeBootWithoutProject: () => Promise<void>;
};

export function useSpacesBoot({
  ready,
  launchCwd,
  home,
  allocId,
  replaceTabs,
  markBooted,
  setActiveSpaceForNewTabs,
  adoptWorkspaceEnv,
}: Params): BootResult {
  const done = useRef(false);
  const [needsSelector, setNeedsSelector] = useState(false);
  const [loadedSpaces, setLoadedSpaces] = useState<SpaceMeta[]>([]);
  const paramsRef = useRef({
    launchCwd,
    home,
    allocId,
    replaceTabs,
    markBooted,
    setActiveSpaceForNewTabs,
    adoptWorkspaceEnv,
  });
  paramsRef.current = {
    launchCwd,
    home,
    allocId,
    replaceTabs,
    markBooted,
    setActiveSpaceForNewTabs,
    adoptWorkspaceEnv,
  };

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;

    void (async () => {
      try {
        const { spaces, activeId, states } = await loadAll();

        // ─── Behaviour C: first launch → show project selector ───────────
        if (spaces.length === 0) {
          setLoadedSpaces([]);
          setNeedsSelector(true);
          return; // Don't call markBooted yet — wait for user selection
        }

        // ─── Restore previous session ────────────────────────────────────
        const restored: Tab[] = [];
        for (const space of spaces) {
          const st = states.get(space.id);
          if (!st) continue;
          restored.push(...hydrateTabs(st.tabs, space.id, allocId));
        }

        const active =
          activeId && spaces.some((s) => s.id === activeId)
            ? activeId
            : spaces[0].id;
        setActiveSpaceForNewTabs(active);

        const env = activeSpaceEnv(spaces, active);
        const restoredHome = await adoptWorkspaceEnv(env);

        if (!restored.some((t) => t.spaceId === active)) {
          const cwd = freshTabCwd(env, restoredHome, launchCwd, home);
          restored.push(freshTerminalTab(active, cwd, allocId));
        }

        await Promise.allSettled(
          uniqueCwds(restored).map((cwd) => native.workspaceAuthorize(cwd)),
        );

        const initialActiveIndex: Record<string, number> = {};
        for (const [id, st] of states)
          initialActiveIndex[id] = st.activeTabIndex;
        useSpaces.getState().hydrate(spaces, active, initialActiveIndex);

        const inActive = restored.filter((t) => t.spaceId === active);
        const idx = states.get(active)?.activeTabIndex ?? 0;
        const activeTab = inActive[idx] ?? inActive[0] ?? restored[0];
        replaceTabs(restored, activeTab.id);

        setLoadedSpaces(spaces);
      } catch (e) {
        console.error("[aterax] spaces boot failed:", e);
      } finally {
        if (!needsSelector) {
          markBooted();
        }
      }
    })();
  }, [ready]);

  const completeBootWithSpace = async (space: SpaceMeta) => {
    const p = paramsRef.current;
    const { allocId, replaceTabs, markBooted, setActiveSpaceForNewTabs, adoptWorkspaceEnv } = p;

    // Save & hydrate
    await saveSpacesList([space]);
    await saveActiveId(space.id);
    setActiveSpaceForNewTabs(space.id);
    useSpaces.getState().hydrate([space], space.id);

    // Set env & authorize
    const env = activeSpaceEnv([space], space.id);
    const restoredHome = await adoptWorkspaceEnv(env);

    // Authorize workspace root
    if (space.root) {
      await native.workspaceAuthorize(space.root).catch(() => {});
    }

    // Create initial tab
    const cwd = freshTabCwd(env, restoredHome, p.launchCwd, p.home);
    const tab = freshTerminalTab(space.id, cwd, allocId);
    replaceTabs([tab], tab.id);

    setNeedsSelector(false);
    markBooted();
  };

  const completeBootWithoutProject = async () => {
    const p = paramsRef.current;
    const { allocId, replaceTabs, markBooted, setActiveSpaceForNewTabs, adoptWorkspaceEnv } = p;

    // Create a default space with no root
    await usePreferencesStore.getState().init().catch(() => {});
    const root = p.launchCwd ?? p.home ?? null;
    const meta: SpaceMeta = {
      id: DEFAULT_SPACE_ID,
      name: "Default",
      root,
      env: parseWorkspaceScopeKey(
        usePreferencesStore.getState().defaultWorkspaceEnv,
      ),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveSpacesList([meta]);
    await saveActiveId(DEFAULT_SPACE_ID);
    setActiveSpaceForNewTabs(DEFAULT_SPACE_ID);
    useSpaces.getState().hydrate([meta], DEFAULT_SPACE_ID);

    const env = activeSpaceEnv([meta], DEFAULT_SPACE_ID);
    const restoredHome = await adoptWorkspaceEnv(env);
    const cwd = freshTabCwd(env, restoredHome, p.launchCwd, p.home);
    const tab = freshTerminalTab(DEFAULT_SPACE_ID, cwd, allocId);
    replaceTabs([tab], tab.id);

    setNeedsSelector(false);
    markBooted();
  };

  return {
    needsProjectSelector: needsSelector,
    loadedSpaces,
    completeBootWithSpace,
    completeBootWithoutProject,
  };
}
