'use client'

import { Link2Off } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

export default function SharedPhotosError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('shareAlbum')

  return (
    <div className="bg-landing-background text-landing-foreground min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md space-y-3 text-center">
        <Link2Off className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="font-display text-2xl font-semibold text-foreground">{t('errorTitle')}</h1>
        <p className="text-muted-foreground">{t('errorDescription')}</p>
        <Button variant="outline" className="rounded-2xl cursor-pointer" onClick={reset}>{t('retry')}</Button>
      </div>
    </div>
  )
}
