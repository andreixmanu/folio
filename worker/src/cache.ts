type Entry = { expires: number; value: Promise<unknown> };

/**
 * Tiny in-isolate TTL cache with request coalescing: concurrent callers for the same key
 * share one upstream request. Failed requests are evicted immediately.
 */
export class TtlCache {
  private store = new Map<string, Entry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && hit.expires > this.now()) return hit.value as Promise<T>;
    const value = load();
    this.store.set(key, { expires: this.now() + ttlMs, value });
    value.catch(() => this.store.delete(key));
    if (this.store.size > 500) this.prune();
    return value;
  }

  /** Pull an entry's expiry forward. Later calls do not extend it. */
  shorten(key: string, ttlMs: number): void {
    const entry = this.store.get(key);
    if (!entry) return;
    const cap = this.now() + ttlMs;
    if (entry.expires > cap) entry.expires = cap;
  }

  private prune() {
    const now = this.now();
    for (const [k, v] of this.store) if (v.expires <= now) this.store.delete(k);
  }
}
