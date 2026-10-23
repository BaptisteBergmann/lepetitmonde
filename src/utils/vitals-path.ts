const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSharePath(pathname: string): boolean {
  return pathname === '/share' || pathname.startsWith('/share/')
}

// Turns a concrete pathname into a route template so ids and share tokens
// never reach the logs.
export function toRouteTemplate(pathname: unknown): string | null {
  if (typeof pathname !== 'string') return null
  if (isSharePath(pathname)) return '/share/[token]'
  return pathname
    .split('/')
    .map((segment) => {
      if (UUID_SEGMENT.test(segment)) return '[id]'
      if (segment.length > 40) return '[param]'
      return segment
    })
    .join('/')
    .slice(0, 200)
}
