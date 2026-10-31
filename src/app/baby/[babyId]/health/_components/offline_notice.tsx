'use client'

import { useTranslations } from 'next-intl'
import { useOnline } from '@/components/use_online'

// Write controls are disabled offline; this says why.
export function OfflineNotice() {
  const t = useTranslations('health')
  const online = useOnline()
  if (online) return null
  return (
    <p role="status" className="mb-4 text-sm text-muted-foreground">
      {t('offline')}
    </p>
  )
}
