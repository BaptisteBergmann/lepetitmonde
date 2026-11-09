"use client"

import { useEffect, useRef } from "react"
import type { RealtimeEvent } from "@/utils/supabase/realtime-relay"

// onReconnect fires on every stream open after the first: events sent while the
// stream was down (phone asleep, 5 min server recycle) are lost, so consumers
// use it to refetch their state.
export function useBabyRealtime(
  babyId: string,
  onEvent: (event: RealtimeEvent) => void,
  options?: { onReconnect?: () => void },
) {
  const onEventRef = useRef(onEvent)
  const onReconnectRef = useRef(options?.onReconnect)
  const onReconnect = options?.onReconnect

  useEffect(() => {
    onEventRef.current = onEvent
    onReconnectRef.current = onReconnect
  })

  useEffect(() => {
    const source = new EventSource(`/api/realtime/${babyId}`)
    let hasOpened = false
    source.onopen = () => {
      if (hasOpened) onReconnectRef.current?.()
      hasOpened = true
    }
    source.onmessage = (message) => {
      onEventRef.current(JSON.parse(message.data) as RealtimeEvent)
    }
    return () => {
      source.close()
    }
  }, [babyId])
}
