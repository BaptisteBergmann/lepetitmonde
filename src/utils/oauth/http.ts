import 'server-only'

// CORS for the public OAuth endpoints (metadata, register, token, revoke), so
// browser-based clients such as MCP Inspector work. No cookies are read and no
// credentials are allowed, so a wildcard origin exposes nothing.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
} as const

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function oauthJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return Response.json(body, { status: init.status ?? 200, headers: { ...CORS_HEADERS, ...init.headers } })
}

export function oauthError(
  error: string,
  description?: string,
  status = 400,
  headers: Record<string, string> = {},
) {
  return oauthJson(
    description ? { error, error_description: description } : { error },
    { status, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', ...headers } },
  )
}

export function tooManyRequests(retryAfterSeconds: number) {
  return oauthError('too_many_requests', undefined, 429, { 'Retry-After': String(retryAfterSeconds) })
}
