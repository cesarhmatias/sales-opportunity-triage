import { z } from "zod";
import { managerOverrideSchema, nextActionSchema, prospectRecordSchema } from "../domain/schemas";
import { createSeedWorkspace, type WorkspaceState } from "../domain/workspace";

export const STORAGE_KEY = "sales_triage_v1";

/* ---------- Schema (validated on every load; anything else falls back to seeds) ---------- */

const stance = z.enum(["work_today", "queue_next", "excluded"]);

const rankSnapshotSchema = z.object({
  rank: z.number().int().positive(),
  ruleRank: z.number().int().positive(),
  score: z.number().nullable(),
  stance,
});

const revisionSchema = z.object({
  id: z.string().min(1),
  prospectId: z.string().min(1),
  kind: z.enum(["qualification_update", "override_set", "override_cleared"]),
  at: z.string(),
  actorId: z.string(),
  reason: z.string().nullable(),
  before: rankSnapshotSchema,
  after: rankSnapshotSchema,
  fieldDiffs: z.array(z.object({ field: z.string(), label: z.string(), from: z.string(), to: z.string() })),
  nextAction: nextActionSchema.nullable(),
});

export const workspaceStateSchema = z
  .object({
    version: z.literal(1),
    actorId: z.string().min(1),
    prospects: z.array(prospectRecordSchema),
    nextActions: z.record(z.string(), nextActionSchema),
    overrides: z.array(managerOverrideSchema),
    revisions: z.array(revisionSchema),
  })
  .refine((s) => new Set(s.prospects.map((p) => p.id)).size === s.prospects.length, "Duplicate prospect ids");

// Compile-time guarantee that the schema and the domain type stay in sync.
type SchemaOutput = z.output<typeof workspaceStateSchema>;
const _schemaMatchesDomain: [SchemaOutput] extends [WorkspaceState]
  ? [WorkspaceState] extends [SchemaOutput]
    ? true
    : never
  : never = true;
void _schemaMatchesDomain;

/* ---------- Load / save (pure over an injected Storage) ---------- */

export type LoadSource = "stored" | "empty" | "invalid" | "unavailable";

export interface LoadResult {
  state: WorkspaceState;
  source: LoadSource;
}

/** Resolving `window.localStorage` can itself throw (blocked cookies, sandboxed iframes). */
export function resolveBrowserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadWorkspaceState(storage: Storage | null): LoadResult {
  if (!storage) return { state: createSeedWorkspace(), source: "unavailable" };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { state: createSeedWorkspace(), source: "unavailable" };
  }
  if (raw === null) return { state: createSeedWorkspace(), source: "empty" };
  try {
    const parsed = workspaceStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { state: parsed.data, source: "stored" } : { state: createSeedWorkspace(), source: "invalid" };
  } catch {
    return { state: createSeedWorkspace(), source: "invalid" };
  }
}

/** Returns false when the write did not persist (storage missing, blocked, or full). */
export function saveWorkspaceState(state: WorkspaceState, storage: Storage | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/* ---------- External store for useSyncExternalStore ---------- */

/**
 * - persisted: the current state is in browser storage
 * - not_saved_yet: showing seeded cases; nothing has been written yet
 * - memory_only: the last write failed (or storage is unavailable); changes are lost on reload
 */
export type PersistenceStatus = "persisted" | "not_saved_yet" | "memory_only";

export type LoadNotice = "invalid_data_replaced" | "storage_unavailable" | null;

export interface WorkspaceSnapshot {
  state: WorkspaceState;
  persistence: PersistenceStatus;
  loadNotice: LoadNotice;
}

export interface WorkspaceStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): WorkspaceSnapshot;
  getServerSnapshot(): WorkspaceSnapshot;
  /** Applies the change in memory, then tries to persist. Returns whether it persisted. */
  update(change: (state: WorkspaceState) => WorkspaceState): boolean;
  /** Restores the seeded cases (keeping the simulated role). Returns whether it persisted. */
  reset(): boolean;
}

/** Constant, clock-free seed snapshot used for server rendering and hydration. */
const SERVER_SNAPSHOT: WorkspaceSnapshot = Object.freeze({
  state: createSeedWorkspace(),
  persistence: "not_saved_yet",
  loadNotice: null,
});

function snapshotFromLoad(result: LoadResult): WorkspaceSnapshot {
  switch (result.source) {
    case "stored":
      return { state: result.state, persistence: "persisted", loadNotice: null };
    case "empty":
      return { state: result.state, persistence: "not_saved_yet", loadNotice: null };
    case "invalid":
      return { state: result.state, persistence: "not_saved_yet", loadNotice: "invalid_data_replaced" };
    case "unavailable":
      return { state: result.state, persistence: "memory_only", loadNotice: "storage_unavailable" };
  }
}

export function createWorkspaceStore(resolveStorage: () => Storage | null = resolveBrowserStorage): WorkspaceStore {
  let snapshot: WorkspaceSnapshot | null = null;
  const listeners = new Set<() => void>();

  const current = (): WorkspaceSnapshot => {
    // Lazily load once, then return the same reference until something changes.
    snapshot ??= snapshotFromLoad(loadWorkspaceState(resolveStorage()));
    return snapshot;
  };

  const emit = () => listeners.forEach((listener) => listener());

  const commit = (state: WorkspaceState, clearsLoadNotice: boolean): boolean => {
    const previousNotice = current().loadNotice;
    const persisted = saveWorkspaceState(state, resolveStorage());
    // A successful write proves storage works again; a reset also replaces any unreadable data.
    const stale = persisted && (previousNotice === "storage_unavailable" || clearsLoadNotice);
    snapshot = {
      state,
      persistence: persisted ? "persisted" : "memory_only",
      loadNotice: stale ? null : previousNotice,
    };
    emit();
    return persisted;
  };

  // Another tab wrote the same key: reload so both tabs show the same data.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    snapshot = snapshotFromLoad(loadWorkspaceState(resolveStorage()));
    emit();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot: current,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    update(change) {
      return commit(change(current().state), false);
    },
    reset() {
      return commit(createSeedWorkspace(current().state.actorId), true);
    },
  };
}
