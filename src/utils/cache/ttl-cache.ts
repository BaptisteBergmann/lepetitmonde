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
//
// Bounded: expired entries are swept on write (at most once per TTL) and the
// map is capped at `maxEntries`, evicting the least recently used key. Without
// this, keys derived from request input (e.g. forged access tokens) would
// grow the map without limit.
type Entry<T> = { value: Promise<T>; expiresAt: number }

export function createTtlCache<T>(ttlMs: number, { maxEntries = 500 }: { maxEntries?: number } = {}) {
  const store = new Map<string, Entry<T>>()
  let lastSweep = Date.now()

  function evict() {
    const now = Date.now()
    if (now - lastSweep > ttlMs) {
      lastSweep = now
      for (const [key, entry] of store) {
        if (entry.expiresAt <= now) store.delete(key)
      }
    }
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value
      if (oldest === undefined) break
      store.delete(oldest)
    }
  }

  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = store.get(key)
      if (hit && hit.expiresAt > Date.now()) {
        // Re-insert so Map iteration order doubles as recency order.
        store.delete(key)
        store.set(key, hit)
        return hit.value
      }

      const value = load()
      const entry = { value, expiresAt: Date.now() + ttlMs }
      store.delete(key)
      store.set(key, entry)
      evict()
      value.catch(() => {
        if (store.get(key) === entry) store.delete(key)
      })
      return value
    },
  }
}
