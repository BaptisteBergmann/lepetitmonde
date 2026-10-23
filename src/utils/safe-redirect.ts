// Pure helpers (no 'use server') so both route handlers and Server Actions can
// share them. Control characters are rejected because the URL parser strips
// \t and \n, which turns "/\t/evil.com" into "//evil.com".
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

export function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !CONTROL_CHARS.test(value)
  )
}

export function safeRedirectPath(path: unknown): string {
  return isSafeRelativePath(path) ? path : '/'
}

export function toSiteUrl(path: unknown, siteUrl: string): URL {
  const base = new URL(siteUrl)
  const url = new URL(safeRedirectPath(path), base)
  // Belt and braces: never leave the site, whatever the parser did.
  return url.origin === base.origin ? url : new URL('/', base)
}
