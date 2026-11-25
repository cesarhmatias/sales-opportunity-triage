import { describe, expect, it, vi } from "vitest";
import { createSeedWorkspace, type WorkspaceState } from "../domain/workspace";
import { BlockedStorage, FullStorage, MemoryStorage } from "../test/fakeStorage";
import {
  STORAGE_KEY,
  createWorkspaceStore,
  loadWorkspaceState,
  saveWorkspaceState,
} from "./triageStorage";

const withRole = (actorId: string): WorkspaceState => ({ ...createSeedWorkspace(), actorId });

describe("loadWorkspaceState / saveWorkspaceState", () => {
  it("round-trips a valid state under the versioned key", () => {
    const storage = new MemoryStorage();
    const state = withRole("sam-patel");
    expect(saveWorkspaceState(state, storage)).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(loadWorkspaceState(storage)).toEqual({ state, source: "stored" });
  });

  it("falls back to seeds when nothing is stored", () => {
    expect(loadWorkspaceState(new MemoryStorage())).toEqual({ state: createSeedWorkspace(), source: "empty" });
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["wrong version", JSON.stringify({ ...createSeedWorkspace(), version: 2 })],
    ["wrong shape", JSON.stringify({ version: 1, prospects: "nope" })],
    [
      "impossible decision date",
      JSON.stringify({
        ...createSeedWorkspace(),
        prospects: createSeedWorkspace().prospects.map((p) => ({ ...p, targetDecisionDate: "2026-02-30" })),
      }),
    ],
  ])("rejects %s and falls back to seeds", (_label, raw) => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    expect(loadWorkspaceState(storage)).toEqual({ state: createSeedWorkspace(), source: "invalid" });
  });

  it("reports unavailable storage instead of throwing", () => {
    expect(loadWorkspaceState(new BlockedStorage()).source).toBe("unavailable");
    expect(loadWorkspaceState(null).source).toBe("unavailable");
  });

  it("returns false when the write throws or storage is missing", () => {
    expect(saveWorkspaceState(createSeedWorkspace(), new FullStorage())).toBe(false);
    expect(saveWorkspaceState(createSeedWorkspace(), new BlockedStorage())).toBe(false);
    expect(saveWorkspaceState(createSeedWorkspace(), null)).toBe(false);
  });
});

describe("createWorkspaceStore", () => {
  it("returns a stable snapshot reference until something changes", () => {
    const store = createWorkspaceStore(() => new MemoryStorage());
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it("serves a constant seeded snapshot for server rendering", () => {
    const a = createWorkspaceStore(() => null).getServerSnapshot();
    const b = createWorkspaceStore(() => new MemoryStorage()).getServerSnapshot();
    expect(a).toBe(b);
    expect(a.state).toEqual(createSeedWorkspace());
    expect(a.persistence).toBe("not_saved_yet");
  });

  it("persists updates, notifies subscribers and reloads the saved state", () => {
    const storage = new MemoryStorage();
    const store = createWorkspaceStore(() => storage);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.update((s) => ({ ...s, actorId: "sam-patel" }))).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().persistence).toBe("persisted");

    const reopened = createWorkspaceStore(() => storage);
    expect(reopened.getSnapshot().state.actorId).toBe("sam-patel");
  });

  it("keeps a failed write in memory and reports memory_only", () => {
    const store = createWorkspaceStore(() => new FullStorage());
    expect(store.update((s) => ({ ...s, actorId: "sam-patel" }))).toBe(false);
    const snapshot = store.getSnapshot();
    expect(snapshot.state.actorId).toBe("sam-patel");
    expect(snapshot.persistence).toBe("memory_only");
  });

  it("flags blocked storage on load", () => {
    const snapshot = createWorkspaceStore(() => new BlockedStorage()).getSnapshot();
    expect(snapshot).toMatchObject({ persistence: "memory_only", loadNotice: "storage_unavailable" });
  });

  it("flags replaced invalid data and clears the notice once a reset persists", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{broken");
    const store = createWorkspaceStore(() => storage);
    expect(store.getSnapshot().loadNotice).toBe("invalid_data_replaced");
    expect(store.reset()).toBe(true);
    expect(store.getSnapshot().loadNotice).toBeNull();
  });

  it("reset restores seeded cases but keeps the simulated role", () => {
    const storage = new MemoryStorage();
    const store = createWorkspaceStore(() => storage);
    store.update((s) => ({ ...s, actorId: "alex-rivera", nextActions: { birch: { summary: "x", ownerId: "alex-rivera", followUpDate: "2026-03-12" } } }));
    store.reset();
    expect(store.getSnapshot().state).toEqual(createSeedWorkspace("alex-rivera"));
  });
});
