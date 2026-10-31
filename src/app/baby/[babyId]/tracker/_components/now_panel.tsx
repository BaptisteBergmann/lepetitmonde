'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowRight, Loader2, Minus, Plus, TriangleAlert, WifiOff, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CareResult } from '@utils/care-validation'
import { createCareEvent, startCareTimer, stopCareTimer } from '@utils/actions/care_events'
import type { CareEvent, TrackerNow } from '@utils/actions/care_events'
import {
  BREAST_SIDES,
  CARE_KINDS,
  CARE_KIND_CONFIG,
  CARE_LIMITS,
  CARE_TONE_CLASSES,
  type BreastSide,
  type CareKind,
  type TimerKind,
} from '@utils/care-events'
import { suggestNextSide } from '@utils/care-time'
import { formatDateAtTimeParts } from '@utils/formatting'
import { cn } from '@utils/utils'
import { ChoiceGroup } from '@/components/choice_group'
import { CareEventModal } from './care_event_modal'
import { Elapsed } from './elapsed'
import { useOnline } from '@/components/use_online'

type OpenAction = 'breastfeed' | 'bottle' | null

export function NowPanel({
  babyId,
  tz,
  state,
}: {
  babyId: string
  tz: string
  state: TrackerNow
}) {
  const router = useRouter()
  const t = useTranslations('tracker')
  const [openAction, setOpenAction] = useState<OpenAction>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const online = useOnline()
  const tileRefs = useRef<Partial<Record<CareKind, HTMLButtonElement | null>>>({})
  const panelRef = useRef<HTMLDivElement | null>(null)

  const busy = pendingKey !== null || !online
  const suggested = suggestNextSide(state.lastBreastfeed)
  const lastBottleAmount = state.lastFeed?.kind === 'bottle' ? state.lastFeed.amount_ml : null

  // Moves focus into a freshly opened panel (suggested side first).
  useEffect(() => {
    if (!openAction) return
    const target = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')
      ?? panelRef.current?.querySelector<HTMLElement>('button, input')
    target?.focus()
  }, [openAction])

  const closePanel = (returnFocus = false) => {
    const kind = openAction
    setOpenAction(null)
    if (returnFocus && kind) tileRefs.current[kind]?.focus()
  }

  async function run(
    key: string,
    action: () => Promise<CareResult>,
    options: { announce: string; errorKey: 'start' | 'stop' | 'save'; onSuccess?: () => void },
  ) {
    if (busy) return
    setPendingKey(key)
    try {
      const result = await action()
      if (!result.ok) {
        if (result.error === 'alreadyRunning') toast.info(t('errors.alreadyRunning'))
        else toast.error(t(`errors.codes.${result.error}`))
        return
      }
      setAnnouncement(options.announce)
      options.onSuccess?.()
    } catch (err) {
      // Thrown messages are masked in production, so only translated fallbacks are shown.
      toast.error(err instanceof TypeError ? t('errors.network') : t(`errors.${options.errorKey}`))
    } finally {
      setPendingKey(null)
      // Also on failure: the other parent may have changed the state already.
      router.refresh()
    }
  }

  const onTile = (kind: CareKind) => {
    if (busy) return
    const quick = CARE_KIND_CONFIG[kind].quick
    if (quick === 'timer') {
      setOpenAction(null)
      void run(`start-${kind}`, () => startCareTimer(babyId, kind as TimerKind), { announce: t('announce.sleepStarted'), errorKey: 'start' })
      return
    }
    setOpenAction((current) => (current === kind ? null : (kind as OpenAction)))
  }

  const startFeed = (side: BreastSide) =>
    run(`side-${side}`, () => startCareTimer(babyId, 'breastfeed', { side }), {
      announce: t('announce.feedStarted'),
      errorKey: 'start',
      onSuccess: () => setOpenAction(null),
    })

  const logBottle = (amountMl?: number) =>
    run(amountMl ? 'bottle' : 'bottle-none', () => createCareEvent(babyId, {
      kind: 'bottle',
      ...(amountMl ? { amountMl } : {}),
    }), {
      announce: t('announce.bottleLogged'),
      errorKey: 'save',
      onSuccess: () => setOpenAction(null),
    })

  const running = (Object.entries(state.ongoing) as [TimerKind, CareEvent][])

  return (
    <section
      className="space-y-3"
      onKeyDown={(e) => { if (e.key === 'Escape' && openAction) closePanel(true) }}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('now.heading')}</h2>

      {!online && (
        <p role="status" className="flex items-center gap-2 rounded-2xl border border-landing-border bg-muted p-3 text-sm">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          {t('offline')}
        </p>
      )}

      {running.map(([kind, event]) => (
        <RunningCard
          key={event.id}
          babyId={babyId}
          kind={kind}
          event={event}
          now={state.now}
          tz={tz}
          disabled={busy}
          pending={pendingKey === `stop-${event.id}`}
          onStop={(side) =>
            run(`stop-${event.id}`, () => stopCareTimer(babyId, event.id, side ? { side } : {}), {
              announce: t(kind === 'sleep' ? 'announce.sleepStopped' : 'announce.feedStopped'),
              errorKey: 'stop',
            })
          }
        />
      ))}

      <div className={cn('grid gap-2', CARE_KINDS.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
        {CARE_KINDS.map((kind) => {
          const config = CARE_KIND_CONFIG[kind]
          const Icon = config.icon
          const isRunning = kind in state.ongoing
          const expandable = config.quick !== 'timer'
          const isOpen = openAction === kind
          const isPending = pendingKey === `start-${kind}`
          const hint = isRunning ? t('quick.running') : config.quick === 'amount' ? t('quick.log') : t('quick.start')
          return (
            <Button
              key={kind}
              ref={(node) => { tileRefs.current[kind] = node }}
              type="button"
              variant="outline"
              disabled={isRunning}
              aria-disabled={busy || undefined}
              aria-expanded={expandable ? isOpen : undefined}
              aria-controls={expandable ? (kind === 'bottle' ? 'bottle-panel' : 'side-chooser') : undefined}
              onClick={() => onTile(kind)}
              className={cn(
                'h-24 flex-col gap-1 whitespace-normal rounded-3xl border-landing-border bg-landing-surface text-center text-landing-foreground',
                isOpen && 'ring-2 ring-primary',
              )}
            >
              {isPending ? (
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              ) : (
                <span className={cn('flex size-8 items-center justify-center rounded-full', CARE_TONE_CLASSES[config.tone])}>
                  <Icon className="size-6" aria-hidden="true" />
                </span>
              )}
              <span className="text-sm font-semibold">{t(`kinds.${kind}`)}</span>
              <span className="text-xs font-normal text-muted-foreground">{hint}</span>
            </Button>
          )
        })}
      </div>

      {openAction === 'breastfeed' && (
        <Card id="side-chooser" role="group" aria-labelledby="side-chooser-title" className="border-landing-border bg-landing-surface">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 id="side-chooser-title" className="font-display text-base font-semibold">{t('quick.sideTitle')}</h3>
              <Button type="button" variant="ghost" size="icon-lg" aria-label={t('quick.cancel')} onClick={() => closePanel(true)}>
                <X aria-hidden="true" />
              </Button>
            </div>
            <div ref={panelRef} className="grid grid-cols-3 gap-2">
              {BREAST_SIDES.map((side) => (
                <Button
                  key={side}
                  type="button"
                  variant="outline"
                  data-autofocus={side === suggested ? '' : undefined}
                  aria-disabled={busy || undefined}
                  onClick={() => startFeed(side)}
                  className={cn(
                    'h-14 flex-col gap-0 rounded-2xl text-base',
                    side === suggested && 'border-primary bg-primary/10',
                  )}
                >
                  {pendingKey === `side-${side}` ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : t(`sides.${side}`)}
                  {side === suggested && <span className="text-xs font-semibold text-primary">{t('quick.suggested')}</span>}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {openAction === 'bottle' && (
        <BottlePanel
          initial={lastBottleAmount ?? CARE_LIMITS.bottleDefault}
          panelRef={panelRef}
          busy={busy}
          pendingKey={pendingKey}
          onClose={() => closePanel(true)}
          onLog={logBottle}
        />
      )}

      <LastFeedCard state={state} suggested={suggested} />

      <p className="sr-only" role="status">{announcement}</p>
    </section>
  )
}

function BottlePanel({
  initial,
  panelRef,
  busy,
  pendingKey,
  onClose,
  onLog,
}: {
  initial: number
  panelRef: React.RefObject<HTMLDivElement | null>
  busy: boolean
  pendingKey: string | null
  onClose: () => void
  onLog: (amountMl?: number) => void
}) {
  const t = useTranslations('tracker')
  const [value, setValue] = useState(String(initial))
  const parsed = /^\d{1,4}$/.test(value) ? Number(value) : NaN
  const valid = parsed >= CARE_LIMITS.amountMin && parsed <= CARE_LIMITS.amountMax
  const clamp = (n: number) => Math.min(CARE_LIMITS.amountMax, Math.max(CARE_LIMITS.bottleStep, n))
  const step = (delta: number) => setValue(String(clamp((Number.isNaN(parsed) ? initial : parsed) + delta)))

  return (
    <Card id="bottle-panel" role="group" aria-labelledby="bottle-panel-title" className="border-landing-border bg-landing-surface">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="bottle-panel-title" className="font-display text-base font-semibold">{t('quick.bottleTitle')}</h3>
          <Button type="button" variant="ghost" size="icon-lg" aria-label={t('quick.cancel')} onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
        <div ref={panelRef} className="flex items-center justify-center gap-3">
          <Button type="button" variant="outline" size="icon-lg" className="size-12 rounded-2xl" aria-label={t('quick.decrease')} onClick={() => step(-CARE_LIMITS.bottleStep)}>
            <Minus aria-hidden="true" />
          </Button>
          <Label htmlFor="bottle-amount" className="sr-only">{t('quick.amountLabel')}</Label>
          <Input
            id="bottle-amount"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={value}
            aria-invalid={value !== '' && !valid ? true : undefined}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
            onBlur={() => { if (valid) setValue(String(parsed)); else if (value !== '') setValue(String(clamp(parsed || initial))) }}
            className="h-14 w-28 text-center font-display text-2xl"
          />
          <span className="text-base text-muted-foreground" aria-hidden="true">ml</span>
          <Button type="button" variant="outline" size="icon-lg" className="size-12 rounded-2xl" aria-label={t('quick.increase')} onClick={() => step(CARE_LIMITS.bottleStep)}>
            <Plus aria-hidden="true" />
          </Button>
        </div>
        <Button type="button" className="h-14 w-full rounded-2xl text-base" disabled={!valid} aria-disabled={busy || undefined} onClick={() => onLog(parsed)}>
          {pendingKey === 'bottle' && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t('quick.logBottle')}
        </Button>
        <Button type="button" variant="ghost" className="h-11 w-full" aria-disabled={busy || undefined} onClick={() => onLog()}>
          {pendingKey === 'bottle-none' && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t('quick.logBottleNoAmount')}
        </Button>
      </CardContent>
    </Card>
  )
}

function RunningCard({
  babyId,
  kind,
  event,
  now,
  tz,
  disabled,
  pending,
  onStop,
}: {
  babyId: string
  kind: TimerKind
  event: CareEvent
  now: string
  tz: string
  disabled: boolean
  pending: boolean
  onStop: (side?: BreastSide) => void
}) {
  const t = useTranslations('tracker')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const config = CARE_KIND_CONFIG[kind]
  const Icon = config.icon
  const [side, setSide] = useState<BreastSide | null>(event.breast_side)
  const [editing, setEditing] = useState(false)
  const time = formatDateAtTimeParts(event.started_at, locale, tz).time
  const tooLong = new Date(now).getTime() - new Date(event.started_at).getTime() > CARE_LIMITS.staleTimerMs

  return (
    <Card className="border-primary/40 bg-primary/10">
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', CARE_TONE_CLASSES[config.tone])}>
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-display text-lg font-semibold">
              <span>
                {t.rich(kind === 'sleep' ? 'running.sleepingFor' : 'running.feedingFor', {
                  duration: () => <Elapsed since={event.started_at} now={now} format="elapsed" />,
                })}
              </span>
              <span className="size-2.5 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
            </p>
            <p className="text-sm text-muted-foreground">
              {t('running.startedBy', { time, name: event.created_by_name ?? tCommon('userFallback') })}
            </p>
            <Button type="button" variant="ghost" size="lg" className="-ml-3 mt-1" aria-disabled={disabled || undefined} onClick={() => { if (!disabled) setEditing(true) }}>
              {t('running.editStart')}
            </Button>
          </div>
        </div>

        {kind === 'breastfeed' && (
          <ChoiceGroup
            value={side}
            onValueChange={setSide}
            label={t('running.side')}
            disabled={disabled}
            options={BREAST_SIDES.map((s) => ({ value: s, label: t(`sides.${s}`) }))}
          />
        )}

        {tooLong && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {t('running.tooLong')}
          </p>
        )}

        <Button type="button" className="h-14 w-full rounded-2xl text-base" aria-disabled={disabled || undefined} onClick={() => onStop(kind === 'breastfeed' ? (side ?? undefined) : undefined)}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t(kind === 'sleep' ? 'running.stopSleep' : 'running.stopFeed')}
        </Button>
      </CardContent>
      {editing && <CareEventModal babyId={babyId} event={event} onClose={() => setEditing(false)} />}
    </Card>
  )
}

function LastFeedCard({ state, suggested }: { state: TrackerNow; suggested: 'left' | 'right' | null }) {
  const t = useTranslations('tracker')
  const feed = state.lastFeed

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardContent className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('lastFeed.title')}</h3>
        {feed ? (
          <p className="text-base font-semibold">
            {t.rich(
              feed.kind === 'bottle'
                ? feed.amount_ml ? 'lastFeed.bottle' : 'lastFeed.bottleNoAmount'
                : 'lastFeed.breast',
              {
                ago: () => <Elapsed since={feed.started_at} now={state.now} format="ago" />,
                amount: feed.amount_ml ?? 0,
                side: feed.breast_side ? t(`sides.${feed.breast_side}`) : '',
              },
            )}
          </p>
        ) : (
          <p className="text-base text-muted-foreground">{t('lastFeed.none')}</p>
        )}
        {suggested && (
          <Badge variant="secondary" className="mt-1">
            <ArrowRight aria-hidden="true" />
            {t('lastFeed.nextSide', { side: t(`sides.${suggested}`) })}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
