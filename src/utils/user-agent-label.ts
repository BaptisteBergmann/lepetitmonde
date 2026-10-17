// Short human-readable device label for the share-link visit log, from simple
// substring checks (no UA parsing dependency). Returns null when nothing
// recognisable is found, so the caller can fall back to the raw string.
export function userAgentLabel(userAgent: string | null): string | null {
  if (!userAgent) return null

  const os = /iPhone/.test(userAgent) ? 'iPhone'
    : /iPad/.test(userAgent) ? 'iPad'
    : /Android/.test(userAgent) ? 'Android'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Macintosh|Mac OS X/.test(userAgent) ? 'Mac'
    : /Linux|X11/.test(userAgent) ? 'Linux'
    : null

  // Order matters: Edge and Opera also contain "Chrome", Chrome contains "Safari".
  const browser = /Edg(e|A|iOS)?\//.test(userAgent) ? 'Edge'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /Firefox\/|FxiOS\//.test(userAgent) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : null

  if (os && browser) return `${os} - ${browser}`
  return os ?? browser
}
