'use server'

import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import { actionError } from './errors'

export async function assertIsAdmin(supabase: Awaited<ReturnType<typeof createClient>>, babyId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')

  const { data: access, error } = await supabase
    .from('baby_access')
    .select('access_level')
    .eq('baby_id', babyId)
    .eq('user_id', user.id)
    .single()

  if (error || !access || access.access_level !== 'admin') {
    throw await actionError('unauthorized')
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

// Every member of a baby (viewer + admin), for content that isn't
// circle-scoped at all — e.g. guess_questions, which any member can see
// once approved.
export async function getAllBabyMemberIds(babyId: string, excludeUserId?: string): Promise<string[]> {
  const supabase = await createClient()

  const { data: access } = await supabase
    .from('baby_access')
    .select('user_id')
    .eq('baby_id', babyId)

  return (access ?? [])
    .map((row) => row.user_id)
    .filter((userId) => userId !== excludeUserId)
}

// Email addresses of every member of a baby — `public.users` has no `email`
// column (only `auth.users` does), so this goes through the Auth admin API
// instead of a table select. Used for broadcast emails (e.g. the faire-part
// announcement) rather than in-app notifications.
export async function getBabyMemberEmails(babyId: string): Promise<string[]> {
  const memberIds = await getAllBabyMemberIds(babyId)
  const adminClient = createAdminClient()

  const emails = await Promise.all(
    memberIds.map(async (userId) => {
      const { data } = await adminClient.auth.admin.getUserById(userId)
      return data.user?.email ?? null
    })
  )

  return emails.filter((email): email is string => !!email)
}

// Every admin of a baby — e.g. to notify about a new member joining.
export async function getBabyAdminIds(babyId: string, excludeUserId?: string): Promise<string[]> {
  const supabase = await createClient()

  const { data: access } = await supabase
    .from('baby_access')
    .select('user_id')
    .eq('baby_id', babyId)
    .eq('access_level', 'admin')

  return (access ?? [])
    .map((row) => row.user_id)
    .filter((userId) => userId !== excludeUserId)
}
