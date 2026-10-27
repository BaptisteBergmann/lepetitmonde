import { getClientIp } from '@utils/client-ip'
import { logger } from '@utils/logger'
import { tokenFailureLimiter, tokenIpLimiter } from '@utils/oauth-limiters'
import { authenticateClient } from '@utils/oauth/clients'
import { getOAuthUrls } from '@utils/oauth/config'
import { corsPreflight, oauthError, oauthJson, tooManyRequests } from '@utils/oauth/http'
import { issueTokensForCode, rotateRefreshToken, type TokenGrantResult } from '@utils/oauth/tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// OAuth token endpoint (RFC 6749 section 3.2). Authenticates the client itself and
// never reads cookies. Never log codes, verifiers, secrets or tokens.
const MAX_BODY_BYTES = 8 * 1024

const unavailable = () => oauthError('temporarily_unavailable', undefined, 503, { 'Retry-After': '5' })

export async function POST(request: Request) {
  const contextLogger = logger.child({ function: 'oauthTokenRoute', route: '/api/oauth/token' })
  const ip = getClientIp(request.headers) ?? 'unknown'

  if (!tokenIpLimiter.hit(ip) || tokenFailureLimiter.isLimited(ip)) {
    contextLogger.warn({ ip }, 'OAuth token endpoint rate limited')
    return tooManyRequests(900)
  }

  const fail = (response: Response) => {
    tokenFailureLimiter.hit(ip)
    return response
  }

  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return oauthError('invalid_request', 'Content-Type must be application/x-www-form-urlencoded')
  }
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return oauthError('invalid_request', 'Request body too large', 413)
  const body = new URLSearchParams(raw)

  const auth = await authenticateClient(request.headers, body)
  if (auth.status === 'error') return unavailable()
  if (auth.status === 'invalid_client') {
    return fail(oauthError('invalid_client', undefined, 401, request.headers.get('authorization') ? { 'WWW-Authenticate': 'Basic' } : {}))
  }
  const clientId = auth.client.id

  const grantType = body.get('grant_type')
  let result: TokenGrantResult

  if (grantType === 'authorization_code') {
    const code = body.get('code')
    const redirectUri = body.get('redirect_uri')
    const codeVerifier = body.get('code_verifier')
    if (!code || !redirectUri || !codeVerifier) return oauthError('invalid_request', 'code, redirect_uri and code_verifier are required')
    const resource = body.get('resource')
    if (resource && resource !== getOAuthUrls().mcpResource) return oauthError('invalid_target')
    result = await issueTokensForCode({ code, clientId, redirectUri, codeVerifier, resource })
  } else if (grantType === 'refresh_token') {
    const refreshToken = body.get('refresh_token')
    if (!refreshToken) return oauthError('invalid_request', 'refresh_token is required')
    const resource = body.get('resource')
    if (resource && resource !== getOAuthUrls().mcpResource) return oauthError('invalid_target')
    result = await rotateRefreshToken({ refreshToken, clientId })
  } else {
    return oauthError('unsupported_grant_type')
  }

  if (result.status === 'error') return unavailable()
  if (result.status === 'invalid_grant') return fail(oauthError('invalid_grant'))

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
