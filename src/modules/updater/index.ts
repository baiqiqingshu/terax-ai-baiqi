/** Stub: Updater module (removed — updater plugin was deleted) */

export function UpdaterDialog() {
  return null;
}

export function useUpdater() {
  return {
    available: false,
    checking: false,
    version: null as string | null,
    checkForUpdate: () => {},
    install: () => {},
  };
}
