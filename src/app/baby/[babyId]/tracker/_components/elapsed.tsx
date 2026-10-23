'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatDuration } from '@utils/care-duration'

// Server render and first client render both use the `now` prop, so hydration
// matches; ticking only starts after mount (same idea as useDisplayTimeZone).
export function Elapsed({
  since,
  now,
  format,
}: {
  since: string
  now: string
  format: 'elapsed' | 'ago'
}) {
  const t = useTranslations('tracker.duration')
  const [clientNow, setClientNow] = useState<number | null>(null)

  useEffect(() => {
    const id = setInterval(() => setClientNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  // A fresh server `now` after router.refresh() wins over a stale tick.
  const current = Math.max(clientNow ?? 0, new Date(now).getTime())
  const ms = Math.max(0, current - new Date(since).getTime())

  const text = format === 'ago' && ms < 60_000
    ? t('now')
    : format === 'ago'
      ? t('ago', { duration: formatDuration(ms, t) })
      : formatDuration(ms, t)

  return <span aria-live="off">{text}</span>
}
