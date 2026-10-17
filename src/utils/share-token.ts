// Share-link token helpers. Only the sha256 of a token is ever stored, so a
// database leak does not expose live links; the token itself is shown once.
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'

// 256 random bits, URL-safe (43 chars).
export function generateShareToken() {
  return randomBytes(32).toString('base64url')
}

export function hashShareToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

// Cheap guard before hashing/querying: legacy tokens are UUIDs (36 chars with
// dashes), new ones are 43 base64url chars.
export function isPlausibleShareToken(token: string) {
  return /^[A-Za-z0-9_-]{20,100}$/.test(token)
}
