import 'server-only'
import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@utils/supabase/admin'
import type { Tables } from '@utils/supabase/database.types'
import type { ResolvedApiToken } from '../api-token'
import { logger } from '../logger'
import {
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_MS,
  CODE_PREFIX,
  GRANT_MAX_AGE_MS,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_MS,
  getOAuthUrls,
} from './config'
import { sha256Hex } from './clients'
import { verifyS256 } from './pkce'

type Grant = Tables<'oauth_grants'>

// Not worth a write on every call; "last used" only needs to be roughly right.
const LAST_USED_REFRESH_MS = 5 * 60 * 1000

const random43 = () => randomBytes(32).toString('base64url')
export const generateAuthCode = () => CODE_PREFIX + random43()
export const generateAccessToken = () => ACCESS_TOKEN_PREFIX + random43()
export const generateRefreshToken = () => REFRESH_TOKEN_PREFIX + random43()
export const hashToken = sha256Hex

export const isPlausibleAccessToken = (t: string) => /^lpma_[A-Za-z0-9_-]{43}$/.test(t)
export const isPlausibleRefreshToken = (t: string) => /^lpmr_[A-Za-z0-9_-]{43}$/.test(t)
export const isPlausibleCode = (t: string) => /^lpmc_[A-Za-z0-9_-]{43}$/.test(t)

export type TokenGrantResult =
  | {
      status: 'ok'
      accessToken: string
      refreshToken: string
      expiresIn: number
      scope: string
    }
  | { status: 'invalid_grant' }
  | { status: 'error' }

// Fresh pair for a grant. The refresh window slides but never passes the absolute
// cap; the access token never outlives the refresh window either.
function newTokenPair(grantCreatedAt: string) {
  const now = Date.now()
  const capAt = new Date(grantCreatedAt).getTime() + GRANT_MAX_AGE_MS
  const refreshExpiresMs = Math.min(now + REFRESH_TOKEN_TTL_MS, capAt)
  const accessExpiresMs = Math.min(now + ACCESS_TOKEN_TTL_MS, refreshExpiresMs)
  const accessToken = generateAccessToken()
  const refreshToken = generateRefreshToken()
  return {
    accessToken,
    refreshToken,
    expiresIn: Math.max(0, Math.floor((accessExpiresMs - now) / 1000)),
    refreshExpiresMs,
    columns: {
      access_token_hash: hashToken(accessToken),
      access_expires_at: new Date(accessExpiresMs).toISOString(),
      refresh_token_hash: hashToken(refreshToken),
      refresh_expires_at: new Date(refreshExpiresMs).toISOString(),
    },
  }
}

async function revokeGrantById(grantId: string, reason: string) {
  const { error } = await createAdminClient()
    .from('oauth_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', grantId)
    .is('revoked_at', null)
  const log = logger.child({ function: revokeGrantById.name, grantId })
  if (error) log.error(error, 'Error revoking OAuth grant')
  else log.warn({ reason }, 'OAuth grant revoked')
}

export async function issueTokensForCode(params: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
  resource: string | null
}): Promise<TokenGrantResult> {
  if (!isPlausibleCode(params.code)) return { status: 'invalid_grant' }
  const contextLogger = logger.child({ function: issueTokensForCode.name, clientId: params.clientId })
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('oauth_grants')
    .select('*')
    .eq('code_hash', hashToken(params.code))
    .maybeSingle()
  if (error) { contextLogger.error(error, 'Error looking up authorization code'); return { status: 'error' } }
  if (!data) return { status: 'invalid_grant' }
  const grant = data as Grant

  // Replay of a code that was already exchanged: whatever it issued is suspect.
  if (grant.code_used_at) {
    await revokeGrantById(grant.id, 'authorization code reused')
    return { status: 'invalid_grant' }
  }
  if (grant.revoked_at || new Date(grant.code_expires_at).getTime() <= Date.now()) return { status: 'invalid_grant' }

  if (
    grant.client_id !== params.clientId ||
    grant.redirect_uri !== params.redirectUri ||
    (params.resource !== null && params.resource !== grant.resource) ||
    !verifyS256(params.codeVerifier, grant.code_challenge)
  ) {
    return { status: 'invalid_grant' }
  }

  const pair = newTokenPair(grant.created_at)
  const nowIso = new Date().toISOString()
  const { data: updated, error: updateError } = await admin
    .from('oauth_grants')
    .update({ ...pair.columns, code_used_at: nowIso })
    .eq('id', grant.id)
    .is('code_used_at', null)
    .is('revoked_at', null)
    .gt('code_expires_at', nowIso)
    .select('id')
  if (updateError) { contextLogger.error(updateError, 'Error issuing OAuth tokens'); return { status: 'error' } }
  if (!updated || updated.length === 0) {
    // Lost a race against another exchange of the same code.
    await revokeGrantById(grant.id, 'authorization code raced')
    return { status: 'invalid_grant' }
  }

  contextLogger.info({ grantId: grant.id, userId: grant.user_id }, 'OAuth tokens issued')
  return { status: 'ok', accessToken: pair.accessToken, refreshToken: pair.refreshToken, expiresIn: pair.expiresIn, scope: grant.scope }
}

export async function rotateRefreshToken(params: { refreshToken: string; clientId: string }): Promise<TokenGrantResult> {
  if (!isPlausibleRefreshToken(params.refreshToken)) return { status: 'invalid_grant' }
  const contextLogger = logger.child({ function: rotateRefreshToken.name, clientId: params.clientId })
  const admin = createAdminClient()
  const oldHash = hashToken(params.refreshToken)

  const { data, error } = await admin
    .from('oauth_grants')
    .select('*')
    .eq('refresh_token_hash', oldHash)
    .maybeSingle()
  if (error) { contextLogger.error(error, 'Error looking up refresh token'); return { status: 'error' } }

  if (!data) {
    // An already-rotated token coming back means two parties hold it: kill the grant.
    const { data: reused, error: reuseError } = await admin
      .from('oauth_grants')
      .select('id')
      .eq('previous_refresh_token_hash', oldHash)
      .maybeSingle()
    if (reuseError) { contextLogger.error(reuseError, 'Error checking refresh token reuse'); return { status: 'error' } }
    if (reused) await revokeGrantById(reused.id as string, 'refresh token reused')
    return { status: 'invalid_grant' }
  }

  const grant = data as Grant
  if (
    grant.revoked_at ||
    grant.client_id !== params.clientId ||
    !grant.refresh_expires_at ||
    new Date(grant.refresh_expires_at).getTime() <= Date.now()
  ) {
    return { status: 'invalid_grant' }
  }

  const pair = newTokenPair(grant.created_at)
  const { data: updated, error: updateError } = await admin
    .from('oauth_grants')
    .update({ ...pair.columns, previous_refresh_token_hash: oldHash })
    .eq('id', grant.id)
    .eq('refresh_token_hash', oldHash)
    .is('revoked_at', null)
    .select('id')
  if (updateError) { contextLogger.error(updateError, 'Error rotating refresh token'); return { status: 'error' } }
  if (!updated || updated.length === 0) return { status: 'invalid_grant' }

  contextLogger.info({ grantId: grant.id, userId: grant.user_id }, 'OAuth refresh token rotated')
  return { status: 'ok', accessToken: pair.accessToken, refreshToken: pair.refreshToken, expiresIn: pair.expiresIn, scope: grant.scope }
}

export async function resolveOAuthAccessToken(token: string): Promise<ResolvedApiToken> {
  if (!isPlausibleAccessToken(token)) return { status: 'invalid' }

  const contextLogger = logger.child({ function: resolveOAuthAccessToken.name })
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('oauth_grants')
    .select('id, user_id, resource, access_expires_at, last_used_at')
    .eq('access_token_hash', hashToken(token))
    .is('revoked_at', null)
    .maybeSingle()

  if (error) { contextLogger.error(error, 'Error looking up OAuth access token'); return { status: 'error' } }
  if (!data) return { status: 'invalid' }
  if (!data.access_expires_at || new Date(data.access_expires_at).getTime() <= Date.now()) return { status: 'invalid' }
  if (data.resource !== getOAuthUrls().mcpResource) return { status: 'invalid' }

  const lastUsed = data.last_used_at ? new Date(data.last_used_at).getTime() : 0
  if (Date.now() - lastUsed > LAST_USED_REFRESH_MS) {
    const { error: touchError } = await admin
      .from('oauth_grants')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
    if (touchError) contextLogger.warn({ grantId: data.id, err: touchError }, 'Could not update last_used_at')
  }

  return { status: 'ok', tokenId: data.id as string, userId: data.user_id as string }
}

// RFC 7009: accepts an access or refresh token, revokes the whole grant, only when it
// belongs to the authenticated client. Unknown tokens are not an error.
export async function revokeGrantByToken(token: string, clientId: string): Promise<{ status: 'ok' | 'error' }> {
  const contextLogger = logger.child({ function: revokeGrantByToken.name, clientId })
  if (!isPlausibleAccessToken(token) && !isPlausibleRefreshToken(token)) return { status: 'ok' }

  const hash = hashToken(token)
  const column = isPlausibleAccessToken(token) ? 'access_token_hash' : 'refresh_token_hash'
  const { error } = await createAdminClient()
    .from('oauth_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq(column, hash)
    .eq('client_id', clientId)
    .is('revoked_at', null)
  if (error) { contextLogger.error(error, 'Error revoking OAuth token'); return { status: 'error' } }
  return { status: 'ok' }
}
