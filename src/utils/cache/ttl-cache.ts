// Small in-process cache for read-mostly lookups that get re-fetched a lot
// in a short window (e.g. several viewers loading the same feed at once).
// Deliberately TTL-only, no explicit invalidation: a short expiry bounds
// staleness to a few seconds without needing every mutation site across the
// codebase to remember to invalidate the right key.
//
// Stores the in-flight promise, not the resolved value, so a burst of
// concurrent callers (e.g. a grid's worth of /api/storage requests arriving
// together) shares one load instead of each missing and loading separately.
// A rejected load is evicted so the next caller retries.
type Entry<T> = { value: Promise<T>; expiresAt: number }

export function createTtlCache<T>(ttlMs: number) {
  const store = new Map<string, Entry<T>>()

  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = store.get(key)
      if (hit && hit.expiresAt > Date.now()) return hit.value

      const value = load()
      const entry = { value, expiresAt: Date.now() + ttlMs }
      store.set(key, entry)
      value.catch(() => {
        if (store.get(key) === entry) store.delete(key)
      })
      return value
    },
  }
}
