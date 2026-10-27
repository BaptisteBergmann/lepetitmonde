import { createHash, timingSafeEqual } from 'node:crypto'

export const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/
export const CODE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/

export function verifyS256(verifier: string, challenge: string) {
  if (!CODE_VERIFIER_RE.test(verifier) || !CODE_CHALLENGE_RE.test(challenge)) return false
  const computed = Buffer.from(createHash('sha256').update(verifier, 'ascii').digest('base64url'))
  const expected = Buffer.from(challenge)
  return computed.length === expected.length && timingSafeEqual(computed, expected)
}
