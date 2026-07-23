'use server'

import { createClient } from '@utils/supabase/server'

export async function assertIsAdmin(supabase: Awaited<ReturnType<typeof createClient>>, babyId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const { data: access, error } = await supabase
    .from('baby_access')
    .select('access_level')
    .eq('baby_id', babyId)
    .eq('user_id', user.id)
    .single()

  if (error || !access || access.access_level !== 'admin') {
    throw new Error("Non autorisé")
  }
}

// Mirrors the "no circle assigned = hidden, admin-only" visibility rule
// already applied client-side when reading posts/events (see withVisibility
// in posts.ts and getEvents in events.ts), but inverted: given a set of
// target circles, who is allowed to see it? Used to compute who should be
// notified about baby-scoped content without over-notifying people who
// couldn't see it in the first place.
export async function getVisibleUserIds(babyId: string, circleIds: string[], excludeUserId?: string): Promise<string[]> {
  const supabase = await createClient()

  const { data: access } = await supabase
    .from('baby_access')
    .select('user_id, access_level')
    .eq('baby_id', babyId)

  const adminIds = (access ?? [])
    .filter((row) => row.access_level === 'admin')
    .map((row) => row.user_id)

  const recipientIds = new Set(adminIds)

  if (circleIds.length > 0) {
    const { data: circleMembers } = await supabase
      .from('circles_access')
      .select('user_id')
      .eq('baby_id', babyId)
      .in('circle_id', circleIds)

    for (const row of circleMembers ?? []) recipientIds.add(row.user_id)
  }

  if (excludeUserId) recipientIds.delete(excludeUserId)

  return Array.from(recipientIds)
}
