import 'server-only'

// In-memory fixed-window limiter. One container per stack, so process memory
// is enough; a restart resets the counters. The map is bounded (unlike the
// TTL caches in L1): expired entries are swept once it passes half of
// maxKeys, and the oldest entries are dropped past maxKeys.
export function createRateLimiter({
  windowMs,
  max,
  maxKeys = 10_000,
}: {
  windowMs: number
  max: number
  maxKeys?: number
}) {
  const entries = new Map<string, { count: number; resetAt: number }>()

  function sweep(now: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key)
    }
    // Map iterates in insertion order, so the first keys are the oldest.
    for (const key of entries.keys()) {
      if (entries.size <= maxKeys) break
      entries.delete(key)
    }
  }

  return {
    /** Counts an attempt. Returns true when it is allowed. */
    hit(key: string): boolean {
      const now = Date.now()
      if (entries.size > maxKeys / 2) sweep(now)

      const entry = entries.get(key)
      if (!entry || entry.resetAt <= now) {
        entries.delete(key) // re-insert so the key becomes the newest
        entries.set(key, { count: 1, resetAt: now + windowMs })
        return true
      }
      entry.count += 1
      return entry.count <= max
    },
    /** True when the key already used up its max in the current window. Doesn't count. */
    isLimited(key: string): boolean {
      const entry = entries.get(key)
      return !!entry && entry.resetAt > Date.now() && entry.count >= max
    },
    reset(key: string) {
      entries.delete(key)
    },
  }
}
