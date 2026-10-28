import { getClientIp } from '@utils/client-ip'
import { logger } from '@utils/logger'
import { tokenFailureLimiter, tokenIpLimiter } from '@utils/oauth-limiters'
import { authenticateClient } from '@utils/oauth/clients'
import { getOAuthUrls } from '@utils/oauth/config'
import { corsPreflight, oauthError, oauthJson, readCappedText, tooManyRequests } from '@utils/oauth/http'
import { issueTokensForCode, rotateRefreshToken, type TokenGrantResult } from '@utils/oauth/tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// OAuth token endpoint (RFC 6749 section 3.2). Authenticates the client itself and
// never reads cookies. Never log codes, verifiers, secrets or tokens.
const unavailable = () => oauthError('temporarily_unavailable', undefined, 503, { 'Retry-After': '5' })

export async function POST(request: Request) {
  const contextLogger = logger.child({ function: 'oauthTokenRoute', route: '/api/oauth/token' })
  const ip = getClientIp(request.headers) ?? 'unknown'

  if (!tokenIpLimiter.hit(ip) || tokenFailureLimiter.isLimited(ip)) {
    contextLogger.warn({ ip }, 'OAuth token endpoint rate limited')
    return tooManyRequests(900)
  }

  const contentType = request.headers.get('content-type')
  const hasBasicAuth = (request.headers.get('authorization') ?? '').toLowerCase().startsWith('basic ')
  let paramKeys: string[] = []
  let clientIdForLog: string | null = null
  let grantType: string | null = null
  // Third-party clients only ever see the error code, so log why. Param names only: the
  // body carries codes, verifiers and secrets.
  const reject = (reason: string, response: Response, countsAsFailure = false, why?: string) => {
    contextLogger.warn(
      { ip, reason, why, status: response.status, grantType, contentType, hasBasicAuth, clientId: clientIdForLog, paramKeys },
      'OAuth token request rejected',
    )
    if (countsAsFailure) tokenFailureLimiter.hit(ip)
    return response
  }

  if (!(contentType ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return reject('content_type', oauthError('invalid_request', 'Content-Type must be application/x-www-form-urlencoded'))
  }
  const raw = await readCappedText(request)
  if (raw === null) return reject('body_too_large', oauthError('invalid_request', 'Request body too large', 413))
  const body = new URLSearchParams(raw)
  // A non-form body under a form Content-Type parses into one huge "key" holding the
  // whole payload, secrets included: only log keys that look like parameter names.
  paramKeys = [...new Set(body.keys())].slice(0, 30).map((k) => (/^[a-z_]{1,40}$/i.test(k) ? k : '<invalid>'))
  const rawClientId = body.get('client_id')
  clientIdForLog = rawClientId && /^[0-9a-f-]{36}$/i.test(rawClientId) ? rawClientId : null
  grantType = body.get('grant_type')

  const auth = await authenticateClient(request.headers, body)
  if (auth.status === 'error') return unavailable()
  if (auth.status === 'invalid_client') {
    return reject('invalid_client', oauthError('invalid_client', undefined, 401, request.headers.get('authorization') ? { 'WWW-Authenticate': 'Basic' } : {}), true, auth.why)
  }
  const clientId = auth.client.id
  clientIdForLog = clientId

  let result: TokenGrantResult

  if (grantType === 'authorization_code') {
    const code = body.get('code')
    const redirectUri = body.get('redirect_uri')
    const codeVerifier = body.get('code_verifier')
    if (!code || !redirectUri || !codeVerifier) return reject('missing_params', oauthError('invalid_request', 'code, redirect_uri and code_verifier are required'))
    const resource = body.get('resource')
    if (resource && resource !== getOAuthUrls().mcpResource) {
      contextLogger.warn({ resource: resource.slice(0, 200) }, 'OAuth token request resource mismatch')
      return reject('invalid_target', oauthError('invalid_target'))
    }
    result = await issueTokensForCode({ code, clientId, redirectUri, codeVerifier, resource })
  } else if (grantType === 'refresh_token') {
    const refreshToken = body.get('refresh_token')
    if (!refreshToken) return reject('missing_params', oauthError('invalid_request', 'refresh_token is required'))
    const resource = body.get('resource')
    if (resource && resource !== getOAuthUrls().mcpResource) {
      contextLogger.warn({ resource: resource.slice(0, 200) }, 'OAuth token request resource mismatch')
      return reject('invalid_target', oauthError('invalid_target'))
    }
    result = await rotateRefreshToken({ refreshToken, clientId })
  } else {
    return reject('unsupported_grant_type', oauthError('unsupported_grant_type'))
  }

  if (result.status === 'error') return unavailable()
  if (result.status === 'invalid_grant') return reject('invalid_grant', oauthError('invalid_grant'), true, result.why)

  contextLogger.info({ grantType, clientId }, 'OAuth tokens issued')
  return oauthJson(
    {
      access_token: result.accessToken,
      token_type: 'Bearer',
      expires_in: result.expiresIn,
      refresh_token: result.refreshToken,
      scope: result.scope,
    },
    { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
  )
}

export const OPTIONS = () => corsPreflight()
