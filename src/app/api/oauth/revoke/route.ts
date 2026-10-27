import { getClientIp } from '@utils/client-ip'
import { revokeIpLimiter } from '@utils/oauth-limiters'
import { authenticateClient } from '@utils/oauth/clients'
import { corsPreflight, oauthError, oauthJson, tooManyRequests } from '@utils/oauth/http'
import { revokeGrantByToken } from '@utils/oauth/tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// RFC 7009. Authenticated as the client; revokes the whole grant when the token
// belongs to it. Always 200 for unknown tokens so it can't be used as an oracle.
const MAX_BODY_BYTES = 8 * 1024

export async function POST(request: Request) {
  const ip = getClientIp(request.headers) ?? 'unknown'
  if (!revokeIpLimiter.hit(ip)) return tooManyRequests(60)

  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return oauthError('invalid_request', 'Content-Type must be application/x-www-form-urlencoded')
  }
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return oauthError('invalid_request', 'Request body too large', 413)
  const body = new URLSearchParams(raw)

  const auth = await authenticateClient(request.headers, body)
  if (auth.status === 'error') return oauthError('temporarily_unavailable', undefined, 503, { 'Retry-After': '5' })
  if (auth.status === 'invalid_client') return oauthError('invalid_client', undefined, 401)

  const token = body.get('token')
  if (!token) return oauthError('invalid_request', 'token is required')

  const result = await revokeGrantByToken(token, auth.client.id)
  if (result.status === 'error') return oauthError('temporarily_unavailable', undefined, 503, { 'Retry-After': '5' })

  return oauthJson({}, { headers: { 'Cache-Control': 'no-store' } })
}

export const OPTIONS = () => corsPreflight()
