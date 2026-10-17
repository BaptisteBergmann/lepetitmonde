'use client'

import { useTranslations } from 'next-intl'
import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// z-40 = floating chrome (docs/z-index.md). Offset above the floating bug
// report button, which sits at the same corner, and the mobile bottom nav.
export function SelectionBar({
  count,
  onCancel,
  onShare,
}: {
  count: number
  onCancel: () => void
  onShare: () => void
}) {
  const t = useTranslations('albums.share')

  return (
    <>
      <p className="sr-only" aria-live="polite">{t('selectedCount', { count })}</p>
      <div className="fixed inset-x-4 bottom-[calc(7rem+env(safe-area-inset-bottom))] md:bottom-20 z-40 mx-auto flex max-w-md gap-2 rounded-2xl border border-landing-border bg-background p-2 shadow-lg animate-in slide-in-from-bottom-4 fade-in motion-reduce:animate-none">
        <Button variant="outline" className="h-11 rounded-2xl cursor-pointer" onClick={onCancel}>
          {t('cancelSelect')}
        </Button>
        <Button className="h-11 flex-1 gap-2 rounded-2xl cursor-pointer" onClick={onShare} disabled={count === 0}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          <span>{t('shareSelection', { count })}</span>
        </Button>
      </div>
    </>
  )
}
