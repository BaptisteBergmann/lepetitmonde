'use server'

import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import { logger } from '../logger'
import { approveUserLimiter } from '../oauth-limiters'
import { buildClientRedirect, parseAuthorizeRequest } from '../oauth/authorize-request'
import { CODE_TTL_MS, MAX_ACTIVE_GRANTS_PER_USER } from '../oauth/config'
import { hashToken, generateAuthCode } from '../oauth/tokens'
import { isAdminOfAnyBaby } from '../oauth/eligibility'

// Results are returned (not thrown) so the consent form can show its own translated
// message: thrown messages are scrubbed from Server Actions in production builds.
export type ConsentResult =
  | { redirectUrl: string }
  | { error: 'unauthorized' | 'invalid' | 'not_eligible' | 'limit_reached' | 'rate_limited' }

// Room for a 4096-char state (MAX_STATE_LENGTH) plus the other params.
const MAX_RAW_QUERY = 8000
const STALE_CODE_MS = 24 * 60 * 60 * 1000

// Both actions re-validate the raw authorize query themselves: nothing the client
// component computed is trusted. They never redirect(): the browser's CSP form-action
// would block a form-initiated redirect to the client's domain, so the component
// navigates with the returned URL instead.
async function loadRequest(rawQuery: unknown) {
  if (typeof rawQuery !== 'string' || rawQuery.length > MAX_RAW_QUERY) return null
  const parsed = await parseAuthorizeRequest(new URLSearchParams(rawQuery))
  return parsed.kind === 'ok' ? parsed.request : null
}

async function getSessionUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function approveOAuthAuthorization(rawQuery: string): Promise<ConsentResult> {
  const user = await getSessionUser()
  if (!user) return { error: 'unauthorized' }

  const contextLogger = logger.child({ function: approveOAuthAuthorization.name, route: '/oauth/authorize', userId: user.id })

  const request = await loadRequest(rawQuery)
  if (!request) return { error: 'invalid' }

  if (!(await isAdminOfAnyBaby(user.id))) return { error: 'not_eligible' }
  if (!approveUserLimiter.hit(user.id)) {
    contextLogger.warn('OAuth approval rate limited')
    return { error: 'rate_limited' }
  }

  const admin = createAdminClient()
  const now = Date.now()

  // No cron: sweep codes that were never exchanged.
  const { error: sweepError } = await admin
    .from('oauth_grants')
    .delete()
    .is('code_used_at', null)
    .lt('code_expires_at', new Date(now - STALE_CODE_MS).toISOString())
  if (sweepError) contextLogger.warn({ err: sweepError }, 'Could not delete stale OAuth codes')

  // Active connections for other clients count towards the cap; this client's own are
  // about to be replaced.
  const { count, error: countError } = await admin
    .from('oauth_grants')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .neq('client_id', request.clientId)
    .not('code_used_at', 'is', null)
    .is('revoked_at', null)
    .gt('refresh_expires_at', new Date(now).toISOString())
  if (countError) { contextLogger.error(countError, 'Error counting OAuth grants'); throw countError }
  if ((count ?? 0) >= MAX_ACTIVE_GRANTS_PER_USER) return { error: 'limit_reached' }

  // Reconnecting the same client replaces its older connections instead of piling up.
  const { error: revokeError } = await admin
    .from('oauth_grants')
    .update({ revoked_at: new Date(now).toISOString() })
    .eq('user_id', user.id)
    .eq('client_id', request.clientId)
    .is('revoked_at', null)
  if (revokeError) { contextLogger.error(revokeError, 'Error revoking previous OAuth grants'); throw revokeError }

  const code = generateAuthCode()
  const { data: grant, error } = await admin
    .from('oauth_grants')
    .insert({
      user_id: user.id,
      client_id: request.clientId,
      scope: request.scope,
      resource: request.resource,
      redirect_uri: request.redirectUri,
      code_hash: hashToken(code),
      code_challenge: request.codeChallenge,
      code_expires_at: new Date(now + CODE_TTL_MS).toISOString(),
    })
    .select('id')
    .single()
  if (error) { contextLogger.error(error, 'Error creating OAuth grant'); throw error }

  contextLogger.info({ grantId: grant.id, clientId: request.clientId }, 'OAuth authorization approved')
  return { redirectUrl: buildClientRedirect(request.redirectUri, { code, state: request.state }) }
}

export async function denyOAuthAuthorization(rawQuery: string): Promise<ConsentResult> {
  const user = await getSessionUser()
  if (!user) return { error: 'unauthorized' }

  const request = await loadRequest(rawQuery)
  if (!request) return { error: 'invalid' }

  return { redirectUrl: buildClientRedirect(request.redirectUri, { error: 'access_denied', state: request.state }) }
}
