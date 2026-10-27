import 'server-only'
import { createRateLimiter } from '@/utils/rate-limit'

// Bad-token attempts per client IP. Only failures are counted, so a client with
// a valid token is never locked out by its own successful calls. Same caveat as
// login-limiters.ts: cf-connecting-ip can be forged on a direct hit to the app port.
export const failedAuthLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 })

// Authenticated calls per token id.
export const tokenCallLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120 })
