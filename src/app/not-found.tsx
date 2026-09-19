import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SearchX } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export default async function NotFound() {
  const t = await getTranslations('common')

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-landing-background px-4 py-24 text-center text-landing-foreground">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <SearchX className="size-5" />
      </span>
      <h1 className="font-display text-2xl font-semibold">{t('notFoundTitle')}</h1>
      <p className="max-w-sm text-sm text-landing-muted">{t('notFoundDescription')}</p>
      <Link href="/" className={buttonVariants()}>{t('backHome')}</Link>
    </div>
  )
}
