// Pure helpers (no server-only) so they can be exercised without the Next runtime.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const FORBIDDEN_CHARS = /[\u0000- \u007F]/

export const MAX_REDIRECT_URI_LENGTH = 500

export function isLoopbackHost(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname)
}

// HTTPS (any host) or plain HTTP on a loopback host only (RFC 8252). No fragment,
// no userinfo, no custom schemes.
export function isAllowedRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > MAX_REDIRECT_URI_LENGTH) return false
  if (FORBIDDEN_CHARS.test(uri)) return false
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.hash || uri.includes('#')) return false
  if (url.username || url.password) return false
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && isLoopbackHost(url.hostname)
}

// Exact string match; the one exception (RFC 8252 section 7.3) is that a loopback
// redirect may use a different port than the registered one.
export function redirectUriMatches(registered: readonly string[], requested: string) {
  if (!isAllowedRedirectUri(requested)) return false
  if (registered.includes(requested)) return true

  const req = new URL(requested)
  if (req.protocol !== 'http:' || !isLoopbackHost(req.hostname)) return false

  return registered.some((candidate) => {
    let reg: URL
    try {
      reg = new URL(candidate)
    } catch {
      return false
    }
    return (
      reg.protocol === 'http:' &&
      isLoopbackHost(reg.hostname) &&
      reg.hostname === req.hostname &&
      reg.pathname === req.pathname &&
      reg.search === req.search
    )
  })
}

// What the consent page shows as "where this sends you back to". Loopback hosts
// return null: the port and path mean nothing to the user. IDNs stay in punycode.
export function redirectDisplayHost(uri: string): string | null {
  const url = new URL(uri)
  if (isLoopbackHost(url.hostname)) return null
  return url.host
}
