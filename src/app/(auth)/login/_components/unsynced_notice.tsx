'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Info } from 'lucide-react'
import { loadOfflineQueue } from '@utils/offline/queue-client'

// Entries logged offline stay on the phone when the session expires. A parent who opens the app
// is redirected here, so this is where they learn that the entries are kept.
export function UnsyncedNotice() {
  const t = useTranslations('auth.login')
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadOfflineQueue()
      .then((queue) => queue.pendingCount())
      .then((n) => { if (!cancelled) setCount(n) })
      // No IndexedDB or script: simply no notice.
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (count === 0) return null
  return (
    <p role="status" className="flex items-start gap-2 rounded-2xl border border-landing-border bg-muted p-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {t('unsyncedNotice', { count })}
    </p>
  )
}
