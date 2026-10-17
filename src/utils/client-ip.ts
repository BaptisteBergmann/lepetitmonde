import { isIP } from 'node:net'

// Visitor IP for the share-link access log. Only cf-connecting-ip is trusted:
// the app is reached through a Cloudflare Tunnel, which sets it to the real
// client IP. x-forwarded-for / x-real-ip are deliberately ignored (client-
// controlled). Caveat: port 3000 is also published on the host, so a request
// that bypasses Cloudflare can fake this header; the log is informational,
// not a security control. Returns null when absent or not a valid IP.
export function getClientIp(headers: Headers): string | null {
  const value = headers.get('cf-connecting-ip')?.trim()
  if (!value || isIP(value) === 0) return null
  return value
}
