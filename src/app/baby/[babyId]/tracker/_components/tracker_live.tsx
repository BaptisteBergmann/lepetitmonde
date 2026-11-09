'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useBabyRealtime } from '@/utils/hooks/use-baby-realtime'

// Renders nothing: refreshes the page when the other parent logs something.
// Bursts (start + stop, own action echoing back) are coalesced into one refresh.
export function TrackerLive({ babyId }: { babyId: string }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => router.refresh(), 300)
  }, [router])

  // The server recycles the stream every 5 min, so a visible tracker costs about
  // one extra refresh per 5 min. Acceptable at this scale.
  useBabyRealtime(
    babyId,
    (event) => {
      if (event.table === 'care_events') scheduleRefresh()
    },
    { onReconnect: scheduleRefresh },
  )

  // Mobile browsers suspend the stream in the background, so events can be missed:
  // resync when the app comes back or the network returns.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) scheduleRefresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', scheduleRefresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', scheduleRefresh)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [scheduleRefresh])

  return null
}
