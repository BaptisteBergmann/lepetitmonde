// API token helpers for the MCP endpoint. Same scheme as share-token.ts: only the
// sha256 of a token is stored, the token itself is shown once. Uses the service role
// (api_tokens has no grants for anon/authenticated), so only import from server code.
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@utils/supabase/admin'
import { logger } from './logger'

export const API_TOKEN_PREFIX = 'lpm_'

// Not worth a write on every call; "last used" only needs to be roughly right.
const LAST_USED_REFRESH_MS = 5 * 60 * 1000

// 256 random bits, URL-safe (43 chars) after the prefix.
export function generateApiToken() {
  return API_TOKEN_PREFIX + randomBytes(32).toString('base64url')
}

export function hashApiToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

// Cheap guard before hashing/querying.
export function isPlausibleApiToken(token: string) {
  return /^lpm_[A-Za-z0-9_-]{43}$/.test(token)
}

export type ResolvedApiToken =
  | { status: 'ok'; tokenId: string; userId: string }
  | { status: 'invalid' } // unknown, revoked or expired
  | { status: 'error' } // lookup failed; says nothing about the token

export async function resolveApiToken(token: string): Promise<ResolvedApiToken> {
  if (!isPlausibleApiToken(token)) return { status: 'invalid' }

  const contextLogger = logger.child({ function: resolveApiToken.name })
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('api_tokens')
    .select('id, user_id, last_used_at, expires_at')
    .eq('token_hash', hashApiToken(token))
    .is('revoked_at', null)
    .maybeSingle()

  if (error) { contextLogger.error(error, 'Error looking up API token'); return { status: 'error' } }
  if (!data) return { status: 'invalid' }
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return { status: 'invalid' }

  const lastUsed = data.last_used_at ? new Date(data.last_used_at).getTime() : 0
  if (Date.now() - lastUsed > LAST_USED_REFRESH_MS) {
    const { error: touchError } = await admin
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
    if (touchError) contextLogger.warn({ tokenId: data.id, err: touchError }, 'Could not update last_used_at')
  }

  return { status: 'ok', tokenId: data.id as string, userId: data.user_id as string }
}
