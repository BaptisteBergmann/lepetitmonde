import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Check, TriangleAlert, X } from 'lucide-react'
import { buttonVariants } from '@components/ui/button'
import { Card, CardContent } from '@components/ui/card'
import { cn } from '@utils/utils'
import { getAuthUser } from '@utils/supabase/auth'
import { parseAuthorizeRequest } from '@utils/oauth/authorize-request'
import { isAdminOfAnyBaby } from '@utils/oauth/eligibility'
import { ConsentForm } from './_components/consent_form'

// The proxy already sends logged-out visitors to /login?redirectTo=<this URL>, but the
// page re-checks the session itself. Nothing from the query is rendered except the
// client name, as a plain text node: it is self-asserted, so the redirect host is
// shown next to it as the real trust signal.
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations('oauthConsent')
  const params = await searchParams

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v))
    else if (value !== undefined) query.append(key, value)
  }

  const { data: { user } } = await getAuthUser()
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/oauth/authorize?${query.toString()}`)}`)

  const parsed = await parseAuthorizeRequest(query)

  // Redirect URI already validated: report back to the client (GET-initiated redirect).
  if (parsed.kind === 'redirect_error') redirect(parsed.url)

  if (parsed.kind === 'error_page') {
    return (
      <Card className="max-w-md mx-auto border-landing-border bg-landing-surface">
        <CardContent className="space-y-4 p-6 text-center">
          <h1 className="font-display text-2xl font-semibold text-destructive">{t('errorTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {parsed.reason === 'invalid_request' ? t('errorMalformedBody') : t('errorBody')}
          </p>
          <Link href="/" className={cn(buttonVariants(), 'w-full')}>{t('openApp')}</Link>
        </CardContent>
      </Card>
    )
  }

  const { request } = parsed
  const eligible = await isAdminOfAnyBaby(user.id)
  const host = request.redirectHost

  return (
    <Card className="max-w-md mx-auto border-landing-border bg-landing-surface">
      <CardContent className="space-y-5 p-6">
        <h1
          className="font-display text-2xl font-semibold text-center break-words line-clamp-2"
          title={request.clientName}
        >
          {t('title', { name: request.clientName })}
        </h1>

        <div className="rounded-2xl border border-landing-border bg-muted/50 p-3 space-y-1">
          {host ? (
            <>
              <p className="text-xs text-landing-muted">{t('untrustedLabel')}</p>
              <p className="font-mono text-sm font-semibold break-all">{host}</p>
            </>
          ) : (
            <p className="text-sm font-semibold">{t('hostLocal')}</p>
          )}
          <p className="text-xs text-landing-muted">{t('hostCheck')}</p>
        </div>

        {eligible ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('canTitle')}</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{t('canDo')}</span>
              </li>
              <li className="flex items-start gap-2">
                <X className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{t('cannotDo')}</span>
              </li>
            </ul>
          </div>
        ) : (
          <div role="status" className="flex items-start gap-2 rounded-2xl bg-muted/50 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{t('notEligible')}</p>
          </div>
        )}

        <p className="text-sm text-landing-muted break-all">{t('signedInAs', { email: user.email ?? '' })}</p>

        <ConsentForm rawQuery={query.toString()} eligible={eligible} host={host} />

        {eligible && <p className="text-xs text-landing-muted">{t('disconnectHint')}</p>}
      </CardContent>
    </Card>
  )
}
