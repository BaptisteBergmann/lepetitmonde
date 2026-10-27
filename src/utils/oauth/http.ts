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

export const MAX_BODY_BYTES = 8 * 1024

// Reads the body as text but stops once the cap is exceeded, so a missing or
// lying Content-Length can't make us buffer an arbitrarily large payload.
export async function readCappedText(request: Request, maxBytes = MAX_BODY_BYTES): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxBytes) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}
