// Small in-process cache for read-mostly lookups that get re-fetched a lot
// in a short window (e.g. several viewers loading the same feed at once).
// Deliberately TTL-only, no explicit invalidation: a short expiry bounds
// staleness to a few seconds without needing every mutation site across the
// codebase to remember to invalidate the right key.
type Entry<T> = { value: T; expiresAt: number }

export function createTtlCache<T>(ttlMs: number) {
  const store = new Map<string, Entry<T>>()

  return {
    async get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = store.get(key)
      if (hit && hit.expiresAt > Date.now()) return hit.value

      const value = await load()
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    },
  }
}
