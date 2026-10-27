import 'server-only'
import { createRateLimiter } from '@/utils/rate-limit'

// Per-container in-memory limiters, keyed by cf-connecting-ip (see client-ip.ts for
// the forgery caveat) unless noted. Same accepted limitation as mcp-limiters.ts.
export const registerIpLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10 })
export const registerGlobalLimiter = createRateLimiter({ windowMs: 24 * 60 * 60 * 1000, max: 100, maxKeys: 1 })

export const tokenIpLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60 })
// Failed grants only (bad code, verifier, refresh token or client).
export const tokenFailureLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 })

export const revokeIpLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30 })

// Keyed by user id.
export const approveUserLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20 })
