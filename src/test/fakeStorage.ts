/** In-memory Storage used to isolate tests from the real localStorage. */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

/** Reads and writes both throw, like storage blocked by browser privacy settings. */
export class BlockedStorage extends MemoryStorage {
  getItem(): string | null {
    throw new DOMException("blocked", "SecurityError");
  }
  setItem(): void {
    throw new DOMException("blocked", "SecurityError");
  }
}

/** Reads work but every write throws, like a full quota. */
export class FullStorage extends MemoryStorage {
  setItem(): void {
    throw new DOMException("full", "QuotaExceededError");
  }
}
