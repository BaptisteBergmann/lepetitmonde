import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

type RealtimeEvent = {
  table: 'users' | 'circles' | 'circles_access'
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: unknown
  old: unknown
}

type Listener = (event: RealtimeEvent) => void

type Entry = {
  channel: RealtimeChannel
  listeners: Set<Listener>
}

const entries = new Map<string, Entry>()

function getRelayClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SERVICE_ROLE_KEY!)
}

function openChannel(babyId: string): Entry {
  const contextLogger = logger.child({ function: openChannel.name, babyId })
  const listeners = new Set<Listener>()
  const supabase = getRelayClient()

  const channel = supabase
    .channel(`realtime-relay-${babyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users', filter: `baby_id=eq.${babyId}` },
      (payload) => {
        for (const listener of listeners) {
          listener({ table: 'users', eventType: payload.eventType as RealtimeEvent['eventType'], new: payload.new, old: payload.old })
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'circles', filter: `baby_id=eq.${babyId}` },
      (payload) => {
        for (const listener of listeners) {
          listener({ table: 'circles', eventType: payload.eventType as RealtimeEvent['eventType'], new: payload.new, old: payload.old })
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'circles_access', filter: `baby_id=eq.${babyId}` },
      (payload) => {
        for (const listener of listeners) {
          listener({ table: 'circles_access', eventType: payload.eventType as RealtimeEvent['eventType'], new: payload.new, old: payload.old })
        }
      }
    )
    .subscribe((status) => {
      contextLogger.debug({ status }, 'Relay channel status changed')
    })

  return { channel, listeners }
}

export function subscribe(babyId: string, listener: Listener): () => void {
  let entry = entries.get(babyId)
  if (!entry) {
    entry = openChannel(babyId)
    entries.set(babyId, entry)
  }
  entry.listeners.add(listener)

  return () => {
    const current = entries.get(babyId)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      current.channel.unsubscribe()
      entries.delete(babyId)
    }
  }
}

export type { RealtimeEvent }
