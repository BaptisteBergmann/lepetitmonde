// Pure helpers (importable by client and server) for the page a bug report
// was filed from. The URL is user-controlled and ends up in an <a href>, and a
// share link's token is a credential, so only same-origin paths are kept and
// share paths are collapsed to a placeholder.
import { isSafeRelativePath } from '@/utils/safe-redirect'

export const BUG_REPORT_URL_MAX = 2000

// "/share", "/share/<token>" and the legacy "/share/album/<token>" all become
// "/share/[token]", dropping the rest of the path, the query and the hash.
export function redactSharePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0]
  return pathname === '/share' || pathname.startsWith('/share/') ? '/share/[token]' : path
}

const SENSITIVE_QUERY_PARAMS = ['token', 'token_hash', 'code', 'access_token', 'refresh_token']
const TOKEN_PAGE_PATTERN = /^\/(invite|signup|reset-password|auth)(\/|$)/

// Invitation and auth links carry credentials in the query or hash. The hash
// is always dropped; known credential params are removed everywhere, and on
// token-bearing pages the whole query goes since other params may be derived.
export function redactPageUrl(path: string): string {
  const shareRedacted = redactSharePath(path)
  if (shareRedacted !== path) return shareRedacted
  const url = new URL(path, 'http://x')
  if (TOKEN_PAGE_PATTERN.test(url.pathname)) return url.pathname
  for (const key of SENSITIVE_QUERY_PARAMS) url.searchParams.delete(key)
  return url.pathname + url.search
}

// What submitBugReport stores: null for anything that isn't a short same-origin
// path (a report never fails because of its URL), a redacted path otherwise.
export function toStoredPageUrl(value: unknown): string | null {
  if (!isSafeRelativePath(value) || value.length > BUG_REPORT_URL_MAX) return null
  return redactPageUrl(value)
}

// For display: legacy rows hold absolute URLs. Returns a relative, redacted
// path, or null when the value can't be parsed.
export function toDisplayPageUrl(value: string): string | null {
  try {
    const url = new URL(value, 'http://x')
    const relative = url.pathname + url.search + url.hash
    // Opaque URLs (e.g. "javascript:...") don't yield a rooted path.
    return isSafeRelativePath(relative) ? redactPageUrl(relative) : null
  } catch {
    return null
  }
}
