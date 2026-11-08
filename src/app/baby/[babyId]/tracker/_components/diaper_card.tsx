'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CircleDot, Droplet, Droplets, Loader2, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CareResult } from '@utils/care-validation'
import { createCareEvent } from '@utils/actions/care_events'
import type { CareEvent, TrackerNow } from '@utils/actions/care_events'
import { formatDateAtTimeParts } from '@utils/formatting'
import { CareEventModal } from './care_event_modal'
import { Elapsed } from './elapsed'
import { diaperContents } from './kind_ui'

// The strip is only a tidy-up prompt: the same action stays in the day log.
const STRIP_TIMEOUT_MS = 60_000

type Run = (
  key: string,
  action: () => Promise<CareResult>,
  options: { announce: string; errorKey: 'start' | 'stop' | 'save'; onSuccess?: () => void },
) => Promise<void>

const ACTIONS: { key: 'pee' | 'poop' | 'both'; pee: boolean; poop: boolean; icon: LucideIcon; label: 'logPee' | 'logPoop' | 'logBoth' }[] = [
  { key: 'pee', pee: true, poop: false, icon: Droplet, label: 'logPee' },
  { key: 'poop', pee: false, poop: true, icon: CircleDot, label: 'logPoop' },
  { key: 'both', pee: true, poop: true, icon: Droplets, label: 'logBoth' },
]

// 'awaiting': a poop was just logged and the refreshed state hasn't arrived yet.
// 'ready': the strip shows for that event id.
type Strip = { phase: 'awaiting'; baselineId: string | null } | { phase: 'ready'; eventId: string } | null

export function DiaperCard({
  babyId,
  tz,
  state,
  busy,
  pendingKey,
  run,
}: {
  babyId: string
  tz: string
  state: TrackerNow
  busy: boolean
  pendingKey: string | null
  run: Run
}) {
  const t = useTranslations('tracker')
  const locale = useLocale()
  const last = state.lastDiaper
  const [strip, setStrip] = useState<Strip>(null)
  const [stripFocused, setStripFocused] = useState(false)
  // Snapshot taken when the button is pressed: a realtime update must not retarget Save/Delete to a newer row.
  const [detailsEvent, setDetailsEvent] = useState<CareEvent | null>(null)
  const poopButtonRef = useRef<HTMLButtonElement | null>(null)

  const hideStrip = () => {
    setStrip(null)
    setStripFocused(false)
  }

  // The refreshed state brings the new event: adopt it (poop only) as the strip's target.
  if (strip?.phase === 'awaiting' && (last?.id ?? null) !== strip.baselineId) {
    setStrip(last?.poop ? { phase: 'ready', eventId: last.id } : null)
    setStripFocused(false)
  }

  const showStrip = strip?.phase === 'ready' && last?.id === strip.eventId && last.poop && !detailsEvent

  // Hidden by a realtime update (a newer diaper): drop the stale focus flag so the next strip still times out.
  const stripStale = strip?.phase === 'ready' && !showStrip && !detailsEvent
  if (stripStale) hideStrip()

  // Auto-hide, paused while focus is inside the strip so an action never vanishes under a keyboard user.
  useEffect(() => {
    if (!showStrip || stripFocused) return
    const timer = window.setTimeout(hideStrip, STRIP_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [showStrip, stripFocused])

  const log = (action: (typeof ACTIONS)[number]) => {
    if (busy) return
    return run(`diaper-${action.key}`, () => createCareEvent(babyId, { kind: 'diaper', pee: action.pee, poop: action.poop }), {
      announce: t('announce.diaperLogged'),
      errorKey: 'save',
      // A pee-only log clears any previous strip; a poop log waits for the refreshed state.
      onSuccess: () => setStrip(action.poop ? { phase: 'awaiting', baselineId: last?.id ?? null } : null),
    })
  }

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('diaper.title')}</h3>
          <p className="text-sm text-muted-foreground">
            {last ? (
              <>
                <span className="sr-only">{t('lastDiaper.title')} </span>
                {t.rich('lastDiaper.ago', {
                  type: diaperContents(last, t),
                  ago: () => (
                    <span className="font-semibold text-landing-foreground">
                      <Elapsed since={last.started_at} now={state.now} format="ago" />
                    </span>
                  ),
                })}
              </>
            ) : (
              t('lastDiaper.none')
            )}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {ACTIONS.map((action) => {
            const Icon = action.icon
            const pending = pendingKey === `diaper-${action.key}`
            return (
              <Button
                key={action.key}
                ref={action.key === 'poop' ? poopButtonRef : undefined}
                type="button"
                variant="outline"
                aria-label={t(`diaper.${action.label}`)}
                aria-disabled={busy || undefined}
                onClick={() => log(action)}
                className="h-16 flex-col gap-1 whitespace-normal rounded-2xl border-landing-border bg-landing-surface text-landing-foreground"
              >
                {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Icon className="size-5 text-chart-1" aria-hidden="true" />}
                <span className="text-sm font-semibold">{t(`diaper.${action.key}`)}</span>
              </Button>
            )
          })}
        </div>

        {showStrip && last && (
          <div
            className="flex items-center justify-between gap-2 motion-safe:animate-in motion-safe:fade-in"
            onFocus={() => setStripFocused(true)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setStripFocused(false) }}
          >
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                {t('diaper.detailsPrompt', {
                  type: diaperContents(last, t),
                  time: formatDateAtTimeParts(last.started_at, locale, tz).time,
                })}
              </p>
              <Button type="button" variant="ghost" className="-ml-3 h-11" aria-disabled={busy || undefined} onClick={() => { if (!busy) setDetailsEvent(last) }}>
                {t('diaper.addDetails')}
              </Button>
            </div>
            <Button type="button" variant="ghost" size="icon-lg" className="size-11 shrink-0" aria-label={t('diaper.dismiss')} onClick={hideStrip}>
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
      </CardContent>
      {detailsEvent && (
        <CareEventModal
          babyId={babyId}
          event={detailsEvent}
          focusDetails
          onClose={() => {
            setDetailsEvent(null)
            hideStrip()
            // The strip button that opened the modal is gone; return focus to a stable control.
            requestAnimationFrame(() => poopButtonRef.current?.focus())
          }}
        />
      )}
    </Card>
  )
}
