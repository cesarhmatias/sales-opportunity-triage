"use client";

import { useSyncExternalStore } from "react";
import { createWorkspaceStore, type WorkspaceSnapshot, type WorkspaceStore } from "./triageStorage";

/** One store per browser tab, backed by localStorage. */
export const workspaceStore: WorkspaceStore = createWorkspaceStore();

/**
 * Reads the persisted workspace without set-state-in-effect: the server and the
 * hydration pass render the seeded snapshot, then React switches to the stored one.
 */
export function useWorkspaceSnapshot(): WorkspaceSnapshot {
  return useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getSnapshot, workspaceStore.getServerSnapshot);
}
