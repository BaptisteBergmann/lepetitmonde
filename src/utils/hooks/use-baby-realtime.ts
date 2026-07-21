"use client"

import { useEffect } from "react"
import type { RealtimeEvent } from "@/utils/supabase/realtime-relay"

export function useBabyRealtime(babyId: string, onEvent: (event: RealtimeEvent) => void) {
  useEffect(() => {
    const source = new EventSource(`/api/realtime/${babyId}`)
    source.onmessage = (message) => {
      onEvent(JSON.parse(message.data) as RealtimeEvent)
    }
    return () => {
      source.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [babyId])
}
