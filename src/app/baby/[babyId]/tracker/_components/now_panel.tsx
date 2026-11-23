'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowRight, Loader2, Minus, Plus, TriangleAlert, WifiOff, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
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
  REFLUX_SEVERITIES,
  type BreastSide,
  type CareKind,
  type RefluxSeverity,
  type TimerKind,
} from '@utils/care-events'
import { suggestNextSide } from '@utils/care-time'
import { formatDateAtTimeParts } from '@utils/formatting'
import { cn } from '@utils/utils'
import { ChoiceGroup } from '@/components/choice_group'
import { CareEventModal } from './care_event_modal'
import { DiaperCard } from './diaper_card'
import { Elapsed } from './elapsed'
import { useOffline, type OfflineTap } from './offline_runtime'

// A tap on a diaper or sleep action that can be queued when the server doesn't answer. The id and
// tap time are fixed before the call so the queued entry and a late-arriving original are the same row.
export type RunOptions = {
  announce: string
  errorKey: 'start' | 'stop' | 'save'
  onSuccess?: () => void
  offline?: OfflineTap
}

// A hung Server Action would leave the tile spinning, so offline-capable taps give up after this.
const OFFLINE_FALLBACK_MS = 8000
class ActionTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ActionTimeout()), OFFLINE_FALLBACK_MS)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

type OpenAction = 'breastfeed' | 'bottle' | 'pumping' | 'reflux' | null

const PANEL_ID: Record<Exclude<OpenAction, null>, string> = {
  breastfeed: 'side-chooser',
  bottle: 'bottle-panel',
  pumping: 'pump-panel',
  reflux: 'reflux-panel',
}

// Diaper has its own card of one-tap actions, so it is in neither row. Row 1 is the big
// timer/feed tiles; row 2 is the compact, rarer pumping and reflux tiles.
const ROW1_KINDS = CARE_KINDS.filter((kind) => ['timer', 'side-timer', 'amount'].includes(CARE_KIND_CONFIG[kind].quick))
const ROW2_KINDS = CARE_KINDS.filter((kind) => ['pump', 'reflux'].includes(CARE_KIND_CONFIG[kind].quick))

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
  const { unreachable, canOpenOfflinePage, saveTap } = useOffline()
  const tileRefs = useRef<Partial<Record<CareKind, HTMLButtonElement | null>>>({})
  const panelRef = useRef<HTMLDivElement | null>(null)

  const busy = pendingKey !== null || unreachable
  const suggested = suggestNextSide(state.lastBreastfeed)
  const lastBottleAmount = state.lastFeed?.kind === 'bottle' ? state.lastFeed.amount_ml : null
  const lastPumpAmount = state.lastPumping?.amount_ml ?? null

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
    options: RunOptions,
  ) {
    if (busy) return
    setPendingKey(key)
    try {
      const result = await (options.offline ? withTimeout(action()) : action())
      if (!result.ok) {
        if (result.error === 'alreadyRunning' || result.error === 'alreadyStopped') toast.info(t(`errors.${result.error}`))
        else toast.error(t(`errors.codes.${result.error}`))
        return
      }
      setAnnouncement(options.announce)
      options.onSuccess?.()
    } catch (err) {
      if (options.offline) {
        // Any thrown error may be an outage: during one, Next throws a plain Error for the gateway's
        // 502/530 or the proxy's 503, not a TypeError. The tap has a fixed id, so keeping it is safe;
        // saveTap probes, and only a reachable server (a real failure) falls through to the toast.
        const networkLike = err instanceof TypeError || err instanceof ActionTimeout
        const outcome = await saveTap(options.offline, { keepIfReachable: networkLike })
        if (outcome === 'reloading' || outcome === 'queued') return
        // 'reachable' (a real failure) or 'failed' (nothing could be saved): show the usual error.
      }
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
      const id = crypto.randomUUID()
      const startedAt = new Date().toISOString()
      void run(`start-${kind}`, () => startCareTimer(babyId, kind as TimerKind, { id }), {
        announce: t('announce.sleepStarted'),
        errorKey: 'start',
        offline: { type: 'startTimer', payload: { id, kind, startedAt } },
      })
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

  const logPump = (amountMl?: number, side?: BreastSide | null) =>
    run(amountMl ? 'pump' : 'pump-none', () => createCareEvent(babyId, {
      kind: 'pumping',
      ...(amountMl ? { amountMl } : {}),
      ...(side ? { side } : {}),
    }), {
      announce: t('announce.pumpLogged'),
      errorKey: 'save',
      onSuccess: () => setOpenAction(null),
    })

  const logReflux = (severity?: RefluxSeverity) =>
    run(severity ? `reflux-${severity}` : 'reflux-none', () => createCareEvent(babyId, {
      kind: 'reflux',
      ...(severity ? { refluxSeverity: severity } : {}),
    }), {
      announce: t('announce.refluxLogged'),
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

      {unreachable && (
        <div className="space-y-2 rounded-2xl border border-landing-border bg-muted p-3">
          <p role="status" className="flex items-center gap-2 text-sm">
            <WifiOff className="size-4 shrink-0" aria-hidden="true" />
            {t('offline')}
          </p>
          {/* Full navigation, not next/link: the service worker has to answer with the static page. */}
          {canOpenOfflinePage && (
            <a href="/offline/index.html" className={buttonVariants({ variant: 'outline', className: 'h-12 w-full rounded-2xl' })}>
              {t('logOffline')}
            </a>
          )}
        </div>
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
          onStop={(side) => {
            // Only sleep can be stopped offline (Phase 1). The tap time goes into the queued op only: online
            // the server stamps the time, so a skewed phone clock can't make a normal tap fail.
            const endedAt = kind === 'sleep' ? new Date().toISOString() : undefined
            return run(`stop-${event.id}`, () => stopCareTimer(babyId, event.id, side ? { side } : {}), {
              announce: t(kind === 'sleep' ? 'announce.sleepStopped' : 'announce.feedStopped'),
              errorKey: 'stop',
              offline: endedAt ? { type: 'stopTimer', payload: { eventId: event.id, endedAt } } : undefined,
            })
          }}
        />
      ))}

      <div className="grid grid-cols-3 gap-2">
        {ROW1_KINDS.map((kind) => {
          const config = CARE_KIND_CONFIG[kind]
          const Icon = config.icon
          const isRunning = kind in state.ongoing
          const expandable = config.quick !== 'timer'
          const isOpen = openAction === kind
          const isPending = pendingKey === `start-${kind}`
          const hint = isRunning ? t('quick.running') : config.quick === 'amount' ? t('quick.log') : t('quick.start')
          // Time since the last one of this kind; sleep counts from waking up.
          const last = isRunning ? null : kind === 'sleep' ? state.lastSleep : kind === 'breastfeed' ? state.lastBreastfeed : kind === 'bottle' ? state.lastBottle : null
          const lastSince = kind === 'sleep' ? last?.ended_at : last?.started_at
          return (
            <Button
              key={kind}
              ref={(node) => { tileRefs.current[kind] = node }}
              type="button"
              variant="outline"
              disabled={isRunning}
              aria-disabled={busy || undefined}
              aria-expanded={expandable ? isOpen : undefined}
              aria-controls={expandable ? PANEL_ID[kind as keyof typeof PANEL_ID] : undefined}
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
              <span className="text-xs font-normal text-muted-foreground">
                {lastSince ? (
                  kind === 'sleep' ? (
                    t.rich('sinceLast.awake', { duration: () => <Elapsed since={lastSince} now={state.now} format="elapsed" /> })
                  ) : (
                    <>
                      <span className="sr-only">{t(`sinceLast.${kind as 'breastfeed' | 'bottle'}`)} </span>
                      <Elapsed since={lastSince} now={state.now} format="ago" />
                    </>
                  )
                ) : hint}
              </span>
            </Button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ROW2_KINDS.map((kind) => {
          const config = CARE_KIND_CONFIG[kind]
          const Icon = config.icon
          const isOpen = openAction === kind
          const lastPumping = kind === 'pumping' ? state.lastPumping : null
          return (
            <Button
              key={kind}
              ref={(node) => { tileRefs.current[kind] = node }}
              type="button"
              variant="outline"
              aria-disabled={busy || undefined}
              aria-expanded={isOpen}
              aria-controls={PANEL_ID[kind as keyof typeof PANEL_ID]}
              onClick={() => onTile(kind)}
              className={cn(
                'h-auto min-h-16 flex-row justify-start gap-3 whitespace-normal rounded-3xl border-landing-border bg-landing-surface px-3 py-2 text-left text-landing-foreground',
                isOpen && 'ring-2 ring-primary',
              )}
            >
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', CARE_TONE_CLASSES[config.tone])}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold">{t(`kinds.${kind}`)}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {lastPumping ? (
                    <>
                      <span className="sr-only">{t('lastPumping.title')} </span>
                      <Elapsed since={lastPumping.started_at} now={state.now} format="ago" />
                    </>
                  ) : t('quick.log')}
                </span>
              </span>
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
        <AmountPanel
          id="bottle-panel"
          title={t('quick.bottleTitle')}
          logLabel={t('quick.logBottle')}
          noAmountLabel={t('quick.logBottleNoAmount')}
          pendingKeys={{ log: 'bottle', none: 'bottle-none' }}
          initial={lastBottleAmount ?? CARE_LIMITS.bottleDefault}
          panelRef={panelRef}
          busy={busy}
          pendingKey={pendingKey}
          onClose={() => closePanel(true)}
          onLog={(amountMl) => logBottle(amountMl)}
        />
      )}

      {openAction === 'pumping' && (
        <PumpPanel
          initial={lastPumpAmount ?? CARE_LIMITS.pumpDefault}
          panelRef={panelRef}
          busy={busy}
          pendingKey={pendingKey}
          onClose={() => closePanel(true)}
          onLog={logPump}
        />
      )}

      {openAction === 'reflux' && (
        <RefluxPanel
          panelRef={panelRef}
          busy={busy}
          pendingKey={pendingKey}
          onClose={() => closePanel(true)}
          onLog={logReflux}
        />
      )}

      <DiaperCard babyId={babyId} tz={tz} state={state} busy={busy} pendingKey={pendingKey} run={run} />

      <LastFeedCard state={state} suggested={suggested} />

      <p className="sr-only" role="status">{announcement}</p>
    </section>
  )
}

// Amount stepper shared by the bottle and pumping panels. `children` renders between the
// stepper and the Log button (pumping puts its optional side row there).
function AmountPanel({
  id,
  title,
  logLabel,
  noAmountLabel,
  pendingKeys,
  initial,
  panelRef,
  busy,
  pendingKey,
  onClose,
  onLog,
  children,
}: {
  id: string
  title: string
  logLabel: string
  noAmountLabel: string
  pendingKeys: { log: string; none: string }
  children?: React.ReactNode
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
    <Card id={id} role="group" aria-labelledby={`${id}-title`} className="border-landing-border bg-landing-surface">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id={`${id}-title`} className="font-display text-base font-semibold">{title}</h3>
          <Button type="button" variant="ghost" size="icon-lg" aria-label={t('quick.cancel')} onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
        <div ref={panelRef} className="flex items-center justify-center gap-3">
          <Button type="button" variant="outline" size="icon-lg" className="size-12 rounded-2xl" aria-label={t('quick.decrease')} onClick={() => step(-CARE_LIMITS.bottleStep)}>
            <Minus aria-hidden="true" />
          </Button>
          <Label htmlFor={`${id}-amount`} className="sr-only">{t('quick.amountLabel')}</Label>
          <Input
            id={`${id}-amount`}
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
        {children}
        <Button type="button" className="h-14 w-full rounded-2xl text-base" disabled={!valid} aria-disabled={busy || undefined} onClick={() => onLog(parsed)}>
          {pendingKey === pendingKeys.log && <Loader2 className="animate-spin" aria-hidden="true" />}
          {logLabel}
        </Button>
        <Button type="button" variant="ghost" className="h-11 w-full" aria-disabled={busy || undefined} onClick={() => onLog()}>
          {pendingKey === pendingKeys.none && <Loader2 className="animate-spin" aria-hidden="true" />}
          {noAmountLabel}
        </Button>
      </CardContent>
    </Card>
  )
}

function PumpPanel({
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
  onLog: (amountMl?: number, side?: BreastSide | null) => void
}) {
  const t = useTranslations('tracker')
  // No silent default: the side stays unset unless the parent picks one.
  const [side, setSide] = useState<BreastSide | null>(null)

  return (
    <AmountPanel
      id="pump-panel"
      title={t('quick.pumpTitle')}
      logLabel={t('quick.logPump')}
      noAmountLabel={t('quick.logPumpNoAmount')}
      pendingKeys={{ log: 'pump', none: 'pump-none' }}
      initial={initial}
      panelRef={panelRef}
      busy={busy}
      pendingKey={pendingKey}
      onClose={onClose}
      onLog={(amountMl) => onLog(amountMl, side)}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('form.pumpSide')}</span>
        <ChoiceGroup
          value={side}
          onValueChange={setSide}
          label={t('form.pumpSide')}
          disabled={busy}
          options={BREAST_SIDES.map((s) => ({ value: s, label: t(`sides.${s}`) }))}
        />
        {side && (
          <Button type="button" variant="ghost" className="h-11 self-start" aria-disabled={busy || undefined} onClick={() => setSide(null)}>
            {t('form.clearSide')}
          </Button>
        )}
      </div>
    </AmountPanel>
  )
}

function RefluxPanel({
  panelRef,
  busy,
  pendingKey,
  onClose,
  onLog,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>
  busy: boolean
  pendingKey: string | null
  onClose: () => void
  onLog: (severity?: RefluxSeverity) => void
}) {
  const t = useTranslations('tracker')
  const ARIA = { small: 'reflux.logSmall', medium: 'reflux.logMedium', large: 'reflux.logLarge' } as const

  return (
    <Card id="reflux-panel" role="group" aria-labelledby="reflux-panel-title" className="border-landing-border bg-landing-surface">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="reflux-panel-title" className="font-display text-base font-semibold">{t('quick.refluxTitle')}</h3>
          <Button type="button" variant="ghost" size="icon-lg" aria-label={t('quick.cancel')} onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
        <div ref={panelRef} className="grid grid-cols-3 gap-2">
          {REFLUX_SEVERITIES.map((severity, index) => (
            <Button
              key={severity}
              type="button"
              variant="outline"
              data-autofocus={index === 0 ? '' : undefined}
              aria-label={t(ARIA[severity])}
              aria-disabled={busy || undefined}
              onClick={() => onLog(severity)}
              className="h-14 rounded-2xl text-base"
            >
              {pendingKey === `reflux-${severity}` ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : t(`reflux.severities.${severity}`)}
            </Button>
          ))}
        </div>
        <Button type="button" variant="ghost" className="h-11 w-full" aria-disabled={busy || undefined} onClick={() => onLog()}>
          {pendingKey === 'reflux-none' && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t('reflux.noDetail')}
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
              {t.rich('running.startedBy', {
                time,
                name: event.created_by_name ?? tCommon('userFallback'),
                duration: () => <Elapsed since={event.started_at} now={now} format="elapsed" />,
              })}
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
