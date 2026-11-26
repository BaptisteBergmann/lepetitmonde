'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useBabyRealtime } from '@/utils/hooks/use-baby-realtime'

const REFRESH_DELAY_MS = 300

// Refreshes the page when another admin changes a to-do list or item. Bursts (and the
// echo of our own writes) collapse into one trailing refresh. While `isBusy()` says
// we have writes pending the refresh is postponed: our own write revalidates the page
// anyway, and refreshing mid-typing is pointless. Returns `scheduleRefresh` for callers
// that need a follow-up snapshot.
export function useTodoLive(babyId: string, { isBusy }: { isBusy?: () => boolean } = {}) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isBusyRef = useRef(isBusy)

  useEffect(() => {
    isBusyRef.current = isBusy
  })

  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    const fire = () => {
      if (isBusyRef.current?.()) {
        timer.current = setTimeout(fire, REFRESH_DELAY_MS)
        return
      }
      timer.current = null
      router.refresh()
    }
    timer.current = setTimeout(fire, REFRESH_DELAY_MS)
  }, [router])

  // The relay only sends bare signals and drops them for non-admins.
  useBabyRealtime(
    babyId,
    (event) => {
      if (event.table === 'todo_lists' || event.table === 'todo_items') scheduleRefresh()
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

  return scheduleRefresh
}
