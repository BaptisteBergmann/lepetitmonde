'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TriangleAlert } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@utils/utils'

// Covers /albums and /albums/[albumId]. Stays inside the page container so
// the baby header keeps showing, unlike the root error boundary.
export default function AlbumsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('common')
  const tAlbums = useTranslations('albums')
  const { babyId } = useParams<{ babyId: string }>()

  return (
    <div className="text-landing-foreground">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" aria-hidden="true" />
        </span>
        <h1 className="font-display text-2xl font-semibold">{t('errorTitle')}</h1>
        <p className="max-w-sm text-sm text-landing-muted">{t('errorDescription')}</p>
        {error.digest && <p className="font-mono text-xs text-landing-muted">{error.digest}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset} className="h-11 cursor-pointer sm:h-9">{t('retry')}</Button>
          <Link
            href={`/baby/${babyId}/albums`}
            className={cn(buttonVariants({ variant: 'outline' }), 'h-11 sm:h-9')}
          >
            {tAlbums('backToAlbums')}
          </Link>
        </div>
      </div>
    </div>
  )
}
