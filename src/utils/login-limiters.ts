import 'server-only'
import { createRateLimiter } from '@/utils/rate-limit'

const WINDOW_MS = 15 * 60 * 1000
// Strict on email+ip, looser per email so a stranger can't lock a family
// member out from one IP, and a per-IP cap. NOTE: the per-IP limit and the IP
// half of the strict key are bypassable until the L9 port bind ships (a
// request reaching the app port directly can forge cf-connecting-ip); the
// per-email limit is the guarantee until then.
// Shared by login and the settings password change, which both guess-check
// a password.
const strictLimiter = createRateLimiter({ windowMs: WINDOW_MS, max: 5 })
const emailLimiter = createRateLimiter({ windowMs: WINDOW_MS, max: 20 })
const ipLimiter = createRateLimiter({ windowMs: WINDOW_MS, max: 30 })

export function strictLoginKey(normalizedEmail: string, ip: string) {
  return `${normalizedEmail}|${ip}`
}

/** Counts an attempt on every limiter. Returns the blocking limiter name, or null when allowed. */
export function hitLoginLimiters(normalizedEmail: string, ip: string): 'email_ip' | 'email' | 'ip' | null {
  // Evaluate all three so every limiter counts the attempt.
  const allowed = [
    ['email_ip', strictLimiter.hit(strictLoginKey(normalizedEmail, ip))],
    ['email', emailLimiter.hit(normalizedEmail)],
    ['ip', ipLimiter.hit(ip)],
  ] as const
  return allowed.find(([, ok]) => !ok)?.[0] ?? null
}

export function resetStrictLoginLimiter(normalizedEmail: string, ip: string) {
  strictLimiter.reset(strictLoginKey(normalizedEmail, ip))
}
