import { getClientIp } from '@utils/client-ip'
import { createAdminClient } from '@utils/supabase/admin'
import { logger } from '@utils/logger'
import { registerGlobalLimiter, registerIpLimiter } from '@utils/oauth-limiters'
import { OAUTH_SCOPE } from '@utils/oauth/config'
import { generateClientSecret, sha256Hex } from '@utils/oauth/clients'
import { corsPreflight, oauthError, oauthJson, readCappedText, tooManyRequests } from '@utils/oauth/http'
import { isAllowedRedirectUri } from '@utils/oauth/redirect-uri'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// RFC 7591 open dynamic client registration. Public on purpose (MCP clients register
// themselves), so it is rate limited and writes nothing but an oauth_clients row, which
// grants nothing until a logged-in admin approves it on the consent page.

const MAX_CLIENT_NAME = 100
const MAX_REDIRECT_URIS = 10
const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const
const STALE_CLIENT_MS = 30 * 24 * 60 * 60 * 1000

type AuthMethod = (typeof AUTH_METHODS)[number]

function sanitizeClientName(value: unknown) {
  if (typeof value !== 'string') return 'MCP client'
  const cleaned = value.replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim()
  return Array.from(cleaned).slice(0, MAX_CLIENT_NAME).join('') || 'MCP client'
}

function isSubsetOf(value: unknown, allowed: readonly string[]) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' && allowed.includes(v))
}

// No cron: stale registrations that never got a grant are swept on each registration.
async function deleteStaleClients() {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - STALE_CLIENT_MS).toISOString()
  const { data: old } = await admin.from('oauth_clients').select('id').lt('created_at', cutoff).limit(100)
  if (!old?.length) return
  const ids = old.map((c) => c.id as string)
  const { data: used } = await admin.from('oauth_grants').select('client_id').in('client_id', ids)
  const usedIds = new Set((used ?? []).map((g) => g.client_id as string))
  const unused = ids.filter((id) => !usedIds.has(id))
  if (unused.length) await admin.from('oauth_clients').delete().in('id', unused)
}

export async function POST(request: Request) {
  const contextLogger = logger.child({ function: 'registerOAuthClient', route: '/api/oauth/register' })

  const ip = getClientIp(request.headers) ?? 'unknown'
  if (!registerIpLimiter.hit(ip) || !registerGlobalLimiter.hit('all')) {
    contextLogger.warn({ ip }, 'OAuth registration rate limited')
    return tooManyRequests(3600)
  }

  const raw = await readCappedText(request)
  if (raw === null) return oauthError('invalid_client_metadata', 'Request body too large', 413)

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return oauthError('invalid_client_metadata', 'Body must be JSON')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return oauthError('invalid_client_metadata', 'Body must be a JSON object')
  }
  const meta = body as Record<string, unknown>

  // Client metadata holds no secrets, so log what was rejected: it's the only way to see
  // what a third-party client (Gemini, Claude.ai...) actually sends.
  const rejected = { ip, clientName: sanitizeClientName(meta.client_name), redirectUris: meta.redirect_uris, grantTypes: meta.grant_types, responseTypes: meta.response_types, authMethod: meta.token_endpoint_auth_method }

  // Keep the URIs that pass and drop the rest: some clients (Gemini) send a batch where
  // only some would be accepted, and rejecting the whole request breaks them. A dropped
  // URI can never be used, since /authorize matches against the stored list.
  const uris = meta.redirect_uris
  const redirectUris = Array.isArray(uris) ? Array.from(new Set(uris.filter(isAllowedRedirectUri))) : []
  if (redirectUris.length < 1 || redirectUris.length > MAX_REDIRECT_URIS) {
    contextLogger.warn(rejected, 'OAuth registration rejected: redirect_uris')
    return oauthError('invalid_redirect_uri', `redirect_uris must hold 1 to ${MAX_REDIRECT_URIS} https or loopback http URIs without fragment`)
  }
  if (Array.isArray(uris) && redirectUris.length < uris.length) {
    const dropped = uris.filter((u) => !redirectUris.includes(u as string))
    contextLogger.warn({ ...rejected, dropped }, 'OAuth registration: dropped disallowed redirect_uris')
  }

  if (meta.grant_types !== undefined && !isSubsetOf(meta.grant_types, ['authorization_code', 'refresh_token'])) {
    contextLogger.warn(rejected, 'OAuth registration rejected: grant_types')
    return oauthError('invalid_client_metadata', 'Unsupported grant_types')
  }
  if (meta.response_types !== undefined && !isSubsetOf(meta.response_types, ['code'])) {
    contextLogger.warn(rejected, 'OAuth registration rejected: response_types')
    return oauthError('invalid_client_metadata', 'Unsupported response_types')
  }

  const method = (meta.token_endpoint_auth_method ?? 'none') as string
  if (!(AUTH_METHODS as readonly string[]).includes(method)) {
    contextLogger.warn(rejected, 'OAuth registration rejected: token_endpoint_auth_method')
    return oauthError('invalid_client_metadata', 'Unsupported token_endpoint_auth_method')
  }
  const authMethod = method as AuthMethod

  const clientName = sanitizeClientName(meta.client_name)
  const secret = authMethod === 'none' ? null : generateClientSecret()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('oauth_clients')
    .insert({
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: authMethod,
      client_secret_hash: secret ? sha256Hex(secret) : null,
    })
    .select('id, created_at')
    .single()
  if (error || !data) {
    contextLogger.error(error, 'Error registering OAuth client')
    return oauthError('server_error', undefined, 503, { 'Retry-After': '5' })
  }

  deleteStaleClients().catch((err) => contextLogger.warn({ err }, 'Could not delete stale OAuth clients'))
  contextLogger.info({ clientId: data.id, clientName }, 'OAuth client registered')

  return oauthJson(
    {
      client_id: data.id,
      client_id_issued_at: Math.floor(new Date(data.created_at as string).getTime() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: authMethod,
      scope: OAUTH_SCOPE,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    },
    { status: 201, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
  )
}

export const OPTIONS = () => corsPreflight()
