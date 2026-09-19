import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

type RealtimeEvent = {
  table: 'users' | 'baby_access' | 'circles' | 'circles_access' | 'inventory_items' | 'stories' | 'story_highlights'
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
      // `users` has no baby_id column — membership changes (join/leave/access level)
      // live on `baby_access`, which does. Nickname edits live here too (nickname is
      // per user+baby); first/last name edits are handled by the unfiltered `users`
      // UPDATE binding below.
      'postgres_changes',
      { event: '*', schema: 'public', table: 'baby_access', filter: `baby_id=eq.${babyId}` },
      (payload) => {
        for (const listener of listeners) {
          listener({ table: 'baby_access', eventType: payload.eventType as RealtimeEvent['eventType'], new: payload.new, old: payload.old })
        }
      }
    )
    .on(
      // Can't filter by baby_id at the subscription level (no such column on
      // `users`), so this fans out to every baby's channel — but the payload
      // (id, first/last name) still leaks across babies unless we check
      // membership before relaying, hence the baby_access lookup below.
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'users' },
      (payload) => {
        const updatedUserId = (payload.new as { id?: string } | null)?.id
        if (!updatedUserId) return
        void supabase
          .from('baby_access')
          .select('user_id')
          .eq('baby_id', babyId)
          .eq('user_id', updatedUserId)
          .maybeSingle()
          .then(({ data }) => {
            if (!data) return
            for (const listener of listeners) {
              listener({ table: 'users', eventType: 'UPDATE', new: payload.new, old: payload.old })
            }
          })
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
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory_items', filter: `baby_id=eq.${babyId}` },
      (payload) => {
        for (const listener of listeners) {
          listener({ table: 'inventory_items', eventType: payload.eventType as RealtimeEvent['eventType'], new: payload.new, old: payload.old })
        }
      }
    )
    .on(
      // `stories` visibility is circle-scoped (non-admins only see stories
      // whose circles they belong to), but this subscription runs on the
      // service-role client with no RLS — forwarding the raw row would leak
      // a story's caption/media path to viewers outside its circle. Strip
      // new/old to a bare signal; consumers refetch via `getActiveStories`,
      // which re-applies the circle check server-side.
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stories', filter: `baby_id=eq.${babyId}` },
      (payload) => {
        for (const listener of listeners) {
          listener({ table: 'stories', eventType: payload.eventType as RealtimeEvent['eventType'], new: null, old: null })
        }
      }
    )
    .on(
      // Same visibility reasoning as `stories` above: a highlight's own row
      // has no circle column, but its name/cover can still hint at circle-
      // restricted content, so strip it too and let consumers refetch via
      // `getHighlights` (circle/RLS-aware).
      'postgres_changes',
      { event: '*', schema: 'public', table: 'story_highlights', filter: `baby_id=eq.${babyId}` },
      (payload) => {
        for (const listener of listeners) {
          listener({ table: 'story_highlights', eventType: payload.eventType as RealtimeEvent['eventType'], new: null, old: null })
        }
      }
    )
    .on(
      // `story_highlight_items` has no baby_id column, so this can't be
      // filtered per-baby and fans out to every baby's channel (same
      // tradeoff as the `users` binding above). Only DELETE is bound:
      // INSERT (adding a story to a highlight) already triggers a `stories`
      // UPDATE via clearStoryExpiry, but removing a story from a highlight
      // touches nothing else, so without this the tray would never learn
      // about it. Forwarded as a `story_highlights` signal since that's
      // what the tray refetches on.
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'story_highlight_items' },
      () => {
        for (const listener of listeners) {
          listener({ table: 'story_highlights', eventType: 'DELETE', new: null, old: null })
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
