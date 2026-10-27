import { getTranslations } from 'next-intl/server'
import { Card, CardContent } from '@components/ui/card'

export default async function Loading() {
  const t = await getTranslations('oauthConsent')
  return (
    <Card className="max-w-md mx-auto border-landing-border bg-landing-surface" role="status" aria-busy="true">
      <CardContent className="space-y-5 p-6">
        <span className="sr-only">{t('loading')}</span>
        <div className="mx-auto h-7 w-48 rounded-xl bg-muted animate-pulse motion-reduce:animate-none" />
        <div className="h-16 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
        <div className="h-11 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
        <div className="h-11 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
      </CardContent>
    </Card>
  )
}
