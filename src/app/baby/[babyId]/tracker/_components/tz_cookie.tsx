'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const COOKIE = 'tz'

// Publishes the device's time zone so the server can compute "today" and
// format times in it. Renders nothing. The first-ever visit renders once with
// the fallback zone, then refreshes once the cookie exists.
export function TzCookie() {
  const router = useRouter()

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!zone) return
    const current = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1)
    if (current && decodeURIComponent(current) === zone) return

    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; SameSite=Lax${secure}`
    router.refresh()
  }, [router])

  return null
}
