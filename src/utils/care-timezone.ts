import 'server-only'
import { cookies } from 'next/headers'
import { resolveTimeZone } from '@utils/care-time'

export const TZ_COOKIE = 'tz'

// Device zone written by components/tz_cookie.tsx; validated here because the cookie is
// client-controlled. Falls back to FAMILY_TIME_ZONE.
export async function getRequestTimeZone(): Promise<string> {
  const store = await cookies()
  return resolveTimeZone(store.get(TZ_COOKIE)?.value)
}
