import { createMcpHandler } from 'mcp-handler'
import { resolveApiToken } from '@utils/api-token'
import { getClientIp } from '@utils/client-ip'
import { failedAuthLimiter, tokenCallLimiter } from '@utils/mcp-limiters'
import { logger } from '@utils/logger'
import { registerTools } from './tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// /api is not covered by the proxy, so this route authenticates itself. Auth comes
// only from the Authorization header, never cookies: a browser never attaches it on
// its own, which also rules out CSRF. Every failure returns the same body, and the
// token is never logged.
function unauthorized() {
  return Response.json(
    { error: 'unauthorized' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
  )
}

async function handle(request: Request) {
  const contextLogger = logger.child({ function: 'mcpRoute', route: '/api/mcp' })

  const match = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')
  const resolved = match ? await resolveApiToken(match[1]) : null

  // A failed lookup is our fault, not the caller's: don't count it against their IP.
  if (resolved?.status === 'error') {
    return Response.json({ error: 'service_unavailable' }, { status: 503, headers: { 'Retry-After': '5' } })
  }

  if (resolved?.status !== 'ok') {
    const ip = getClientIp(request.headers) ?? 'unknown'
    if (!failedAuthLimiter.hit(ip)) {
      contextLogger.warn({ ip }, 'Too many failed MCP auth attempts')
      return Response.json({ error: 'too_many_requests' }, { status: 429, headers: { 'Retry-After': '900' } })
    }
    return unauthorized()
  }

  const auth = resolved

  if (!tokenCallLimiter.hit(auth.tokenId)) {
    contextLogger.warn({ tokenId: auth.tokenId, userId: auth.userId }, 'MCP token rate limited')
    return Response.json({ error: 'too_many_requests' }, { status: 429, headers: { 'Retry-After': '60' } })
  }

  // Stateless: one lightweight server per request, so the verified user id is
  // carried by closure instead of any shared state.
  const handler = createMcpHandler(
    (server) => registerTools(server, auth),
    // 0 rejects subscriptions/listen so no long-lived SSE stream is ever opened.
    { serverInfo: { name: 'lepetitmonde', version: '1.0.0' }, maxSubscriptions: 0 },
  )
  return handler(request)
}

export { handle as GET, handle as POST, handle as DELETE }
