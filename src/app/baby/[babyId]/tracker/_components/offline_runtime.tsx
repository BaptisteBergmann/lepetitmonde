'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useMessages, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Info, Loader2, TriangleAlert } from 'lucide-react'
import { buttonVariants, Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { TrackerNow } from '@utils/actions/care_events'
import { loadOfflineQueue, type OfflineOpType, type OfflineQueueApi } from '@utils/offline/queue-client'
import { useOnline } from '@/components/use_online'
import { cn } from '@utils/utils'

export type OfflineTap = { type: OfflineOpType; payload: Record<string, unknown> }
export type SaveTapResult = 'reloading' | 'queued' | 'failed'

type OfflineContextValue = {
  // True when the phone has no network or the last probe could not reach the server.
  unreachable: boolean
  // Queues a tap that could not reach the server. Never throws.
  saveTap: (tap: OfflineTap) => Promise<SaveTapResult>
}

const OfflineContext = createContext<OfflineContextValue>({
  unreachable: false,
  saveTap: async () => 'failed',
})

export function useOffline() {
  return useContext(OfflineContext)
}

const RETRY_MS = 30_000
const OFFLINE_PAGE = '/offline/index.html'

type Strip = { waiting: number; attention: number; syncing: boolean; failed: boolean }

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Keeps the offline quick-log page and the queue in step with the live tracker: stores the
// last-known state for the static page, drains queued entries, and shows what is waiting.
// Children (the Now panel) read the reachability and the "save this tap" helper from context.
export function OfflineRuntime({
  userId,
  babyId,
  babyName,
  state,
  children,
}: {
  userId: string
  babyId: string
  babyName: string
  state: TrackerNow
  children: ReactNode
}) {
  const router = useRouter()
  const t = useTranslations('tracker')
  const locale = useLocale()
  const messages = useMessages()
  const online = useOnline()
  const [queue, setQueue] = useState<OfflineQueueApi | null>(null)
  const [probeUnreachable, setProbeUnreachable] = useState(false)
  const [strip, setStrip] = useState<Strip>({ waiting: 0, attention: 0, syncing: false, failed: false })
  const sawOutage = useRef(false)
  const draining = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    loadOfflineQueue().then(
      (q) => { if (!cancelled) setQueue(q) },
      // Storage or the script is unavailable (private mode, blocked): the live tracker still works
      // without offline support, and the server-side logger isn't available in the browser.
      () => {},
    )
    return () => { cancelled = true }
  }, [])

  // Last-known state for the offline page. Only what the quick-log shows: no notes, no member names.
  useEffect(() => {
    if (!queue) return
    const strings = (messages.tracker as { offlinePage?: Record<string, string> } | undefined)?.offlinePage ?? {}
    const lastDiaper = state.lastDiaper
    const lastSleep = state.lastSleep
    queue
      .saveSnapshot(userId, babyId, {
        babyName,
        locale,
        strings,
        ongoing: Object.values(state.ongoing).map((e) => ({
          id: e.id,
          kind: e.kind,
          started_at: e.started_at,
          breast_side: e.breast_side,
        })),
        lastDiaper: lastDiaper ? { started_at: lastDiaper.started_at, pee: lastDiaper.pee, poop: lastDiaper.poop } : null,
        lastSleep: lastSleep ? { started_at: lastSleep.started_at, ended_at: lastSleep.ended_at } : null,
      })
      .catch(() => { /* best effort: the live page keeps working without a snapshot */ })
  }, [queue, state, userId, babyId, babyName, locale, messages])

  const refreshStrip = useCallback(async () => {
    if (!queue) return
    const ops = await queue.listOps(userId)
    const attention = queue.countEntries(ops.filter((o) => o.status === 'needs_attention'))
    const waiting = queue.countEntries(ops.filter((o) => o.status !== 'needs_attention'))
    setStrip((s) => ({ ...s, waiting, attention }))
  }, [queue, userId])

  const drain = useCallback(async () => {
    if (!queue || draining.current) return
    draining.current = true
    try {
      const ops = await queue.listOps(userId)
      if (!ops.some((o) => o.status !== 'needs_attention')) {
        await refreshStrip()
        return
      }
      setStrip((s) => ({ ...s, syncing: true, failed: false }))
      const result = await queue.drain()
      await refreshStrip()
      if (result.state === 'drained') {
        setProbeUnreachable(false)
        if (result.sent > 0) {
          toast.success(t('sync.allSent'))
          // After an outage the realtime stream is dead (it never reconnects after a gateway
          // error), so reload instead of just refreshing.
          if (sawOutage.current) window.location.reload()
          else router.refresh()
        }
      } else if (result.state === 'unreachable' || result.state === 'failed' || result.state === 'busy') {
        sawOutage.current = true
        setStrip((s) => ({ ...s, failed: result.state !== 'busy' }))
        if (retryTimer.current) clearTimeout(retryTimer.current)
        retryTimer.current = setTimeout(() => { void drain() }, RETRY_MS)
      }
    } finally {
      draining.current = false
      setStrip((s) => ({ ...s, syncing: false }))
    }
  }, [queue, userId, refreshStrip, router, t])

  // Drain on open, when the app returns to the foreground and when the network comes back.
  useEffect(() => {
    if (!queue) return
    void drain()
    const onVisible = () => { if (document.visibilityState === 'visible') void drain() }
    const onOnline = () => { void drain() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('pageshow', onOnline)
    const unsubscribe = queue.subscribe(() => { void refreshStrip() })
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('pageshow', onOnline)
      unsubscribe()
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [queue, drain, refreshStrip])

  const saveTap = useCallback<OfflineContextValue['saveTap']>(async (tap) => {
    try {
      const q = queue ?? (await loadOfflineQueue())
      await q.enqueue(userId, babyId, tap.type, tap.payload)
      const probe = await q.probe()
      if (probe.state === 'unreachable') {
        sawOutage.current = true
        setProbeUnreachable(true)
        // Only the service worker can serve the quick-log: without it a reload would be a dead page.
        if (navigator.serviceWorker?.controller) {
          toast.info(t('offlineSavedToast'))
          window.location.reload()
          return 'reloading'
        }
      }
      toast.info(t('offlinePage.savedFromTracker'))
      void refreshStrip()
      return 'queued'
    } catch {
      return 'failed'
    }
  }, [queue, userId, babyId, refreshStrip, t])

  const value = useMemo<OfflineContextValue>(
    () => ({ unreachable: !online || probeUnreachable, saveTap }),
    [online, probeUnreachable, saveTap],
  )

  const stripCount = strip.waiting
  return (
    <OfflineContext.Provider value={value}>
      {(strip.syncing || strip.failed || strip.attention > 0) && (
        <Card className="border-landing-border bg-landing-surface">
          <CardContent className="space-y-2">
            {strip.syncing && (
              <p role="status" className="flex items-center gap-2 text-sm">
                <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
                {t('sync.sending', { count: stripCount })}
              </p>
            )}
            {!strip.syncing && strip.failed && stripCount > 0 && (
              <div className="space-y-1">
                <p className="flex items-start gap-2 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  {t('sync.failed', { count: stripCount })}
                </p>
                {isIos() && (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {t('offlinePage.willSyncOnOpen')}
                  </p>
                )}
                <Button type="button" variant="ghost" className="-ml-3 h-11" onClick={() => void drain()}>
                  {t('sync.tryAgain')}
                </Button>
              </div>
            )}
            {strip.attention > 0 && (
              <p className="flex flex-wrap items-center gap-x-2 text-sm">
                <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                <span>{t('sync.attention', { count: strip.attention })}</span>
                {/* Full navigation, not next/link: the service worker must answer this request. */}
                <a href={OFFLINE_PAGE} className={cn(buttonVariants({ variant: 'ghost' }), 'h-11')}>
                  {t('sync.review')}
                </a>
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {children}
    </OfflineContext.Provider>
  )
}
