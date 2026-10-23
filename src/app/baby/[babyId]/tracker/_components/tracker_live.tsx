'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useBabyRealtime } from '@/utils/hooks/use-baby-realtime'

// Renders nothing: refreshes the page when the other parent logs something.
// Bursts (start + stop, own action echoing back) are coalesced into one refresh.
export function TrackerLive({ babyId }: { babyId: string }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useBabyRealtime(babyId, (event) => {
    if (event.table !== 'care_events') return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => router.refresh(), 300)
  })

  return null
}
