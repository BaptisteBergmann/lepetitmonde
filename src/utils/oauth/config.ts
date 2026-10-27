import 'server-only'

// Every URL we advertise or compare against comes from SITE_URL, never from request
// headers (Host / X-Forwarded-* are client-controlled). Dev and prod have different
// SITE_URLs, so a token issued by one stack carries the other's `resource` and is
// rejected there even if the two share a database.
export const OAUTH_SCOPE = 'mcp'

export const CODE_PREFIX = 'lpmc_'
export const ACCESS_TOKEN_PREFIX = 'lpma_'
export const REFRESH_TOKEN_PREFIX = 'lpmr_'
export const CLIENT_SECRET_PREFIX = 'lpmcs_'

export const CODE_TTL_MS = 2 * 60 * 1000
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000
// Sliding window renewed on every refresh, bounded by an absolute cap per grant.
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const GRANT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export const MAX_ACTIVE_GRANTS_PER_USER = 10

let cached: { issuer: string; mcpResource: string; prmUrl: string } | null = null

export function getOAuthUrls() {
  if (cached) return cached
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error('SITE_URL is required for OAuth')
  const issuer = new URL(siteUrl).origin
  cached = {
    issuer,
    mcpResource: `${issuer}/api/mcp`,
    prmUrl: `${issuer}/.well-known/oauth-protected-resource/api/mcp`,
  }
  return cached
}
