// Small helper for logging how long a server-side operation took, without
// repeating the same start/end/log boilerplate at every call site.
export async function withTiming<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now()
  const result = await fn()
  return { result, durationMs: Math.round(performance.now() - start) }
}
