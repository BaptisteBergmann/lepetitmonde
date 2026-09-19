'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { TriangleAlert } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@utils/utils'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('common')

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-landing-background px-4 py-24 text-center text-landing-foreground">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-5" />
      </span>
      <h1 className="font-display text-2xl font-semibold">{t('errorTitle')}</h1>
      <p className="max-w-sm text-sm text-landing-muted">{t('errorDescription')}</p>
      {error.digest && <p className="font-mono text-xs text-landing-muted">{error.digest}</p>}
      <div className="flex gap-2">
        <Button onClick={reset} className="cursor-pointer">{t('retry')}</Button>
        <Link href="/" className={cn(buttonVariants({ variant: 'outline' }))}>{t('backHome')}</Link>
      </div>
    </div>
  )
}
