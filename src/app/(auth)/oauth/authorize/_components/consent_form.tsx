'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  approveOAuthAuthorization,
  denyOAuthAuthorization,
  type ConsentResult,
} from '@/utils/actions/oauth'

// Slow or blocked navigation (e.g. a handler for the redirect scheme) shows a plain link.
const FALLBACK_DELAY_MS = 8000

type Pending = 'approve' | 'deny' | null
type ErrorKey = 'actionError' | 'sessionExpired' | 'limitReached' | 'rateLimited' | 'notEligible'

// The actions return the client's redirect URL instead of calling redirect(): the CSP
// has form-action 'self', which browsers also apply to the redirect after a form
// submission, so we navigate with JS.
export function ConsentForm({
  rawQuery,
  eligible,
  host,
}: {
  rawQuery: string
  eligible: boolean
  host: string | null
}) {
  const t = useTranslations('oauthConsent')
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null)
  const [showFallback, setShowFallback] = useState(false)
  const errorRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!redirectUrl) return
    const timer = setTimeout(() => setShowFallback(true), FALLBACK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [redirectUrl])

  // Coming back through the back/forward cache restores the page as it was left:
  // reset it so the buttons aren't stuck disabled.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return
      setPending(null)
      setRedirectUrl(null)
      setShowFallback(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  async function run(kind: 'approve' | 'deny') {
    setPending(kind)
    setError(null)
    let result: ConsentResult
    try {
      result = await (kind === 'approve' ? approveOAuthAuthorization(rawQuery) : denyOAuthAuthorization(rawQuery))
    } catch {
      setPending(null)
      setError('actionError')
      return
    }
    if ('redirectUrl' in result) {
      // Keep the buttons disabled: the page is leaving.
      setRedirectUrl(result.redirectUrl)
      window.location.assign(result.redirectUrl)
      return
    }
    setPending(null)
    setError(
      result.error === 'unauthorized' ? 'sessionExpired'
        : result.error === 'limit_reached' ? 'limitReached'
        : result.error === 'rate_limited' ? 'rateLimited'
        : result.error === 'not_eligible' ? 'notEligible'
        : 'actionError',
    )
  }

  const busy = pending !== null || redirectUrl !== null

  return (
    <div className="space-y-3">
      {eligible && (
        <Button
          type="button"
          className="h-11 w-full"
          disabled={busy}
          aria-busy={pending === 'approve'}
          onClick={() => run('approve')}
        >
          {pending === 'approve' ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t('allowBusy')}
            </>
          ) : (
            t('allow')
          )}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        disabled={busy}
        aria-busy={pending === 'deny'}
        onClick={() => run('deny')}
      >
        {pending === 'deny' ? (
          <>
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {t('denyBusy')}
          </>
        ) : eligible ? (
          t('deny')
        ) : host ? (
          t('backToHost', { host })
        ) : (
          t('backToApp')
        )}
      </Button>

      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-destructive outline-none">
          {t(error)}
          {error === 'limitReached' && (
            <>
              {' '}
              <Link href="/settings" className="underline underline-offset-4">{t('limitReachedLink')}</Link>
            </>
          )}
        </p>
      )}

      {showFallback && redirectUrl && (
        <p className="text-sm">
          <a href={redirectUrl} className="underline underline-offset-4">
            {t('fallbackLink')}{host ? ` ${host}` : ''}
          </a>
        </p>
      )}
    </div>
  )
}
