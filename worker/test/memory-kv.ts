/** In-memory KV. `expirationTtl` is recorded and otherwise ignored, matching the test contract. */
export class MemoryKv {
  readonly store = new Map<string, string>();
  readonly puts: { key: string; value: string; options?: { expirationTtl?: number } }[] = [];

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
    this.puts.push({ key, value, options });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
