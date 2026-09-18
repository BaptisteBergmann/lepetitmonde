'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { cache } from 'react'
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Tables, TablesInsert } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { logger } from '../logger'
import { assertIsAdmin } from './access'
import { notifyUsers } from './notify'
import { actionError } from './errors'
import { createTtlCache } from '../cache/ttl-cache'

type NewCircle = TablesInsert<'circles'>;

export async function createCircle(circle: FormData) {
  const supabase = await createClient()

  const babyId = circle.get("babyId") as string
  const name = circle.get("name") as string

  await assertIsAdmin(supabase, babyId)

  const rep = await supabase
    .from('circles')
    .insert([{ name, baby_id: babyId }])

  if (rep.error) throw rep.error

  revalidatePath(`/baby/${babyId}/admin`)
}

export async function deleteCircle(circleId: string, babyId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  await supabase
    .from('circles_access')
    .delete()
    .eq('circle_id', circleId)
    .eq('baby_id', babyId)

  const rep = await supabase
    .from('circles')
    .delete()
    .eq('id', circleId)
    .eq('baby_id', babyId)

  if (rep.error) throw rep.error

  revalidatePath(`/baby/${babyId}/admin`)
}

type Circle = Tables<'circles'>;

export async function getCircles(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const rep = await supabase
    .from('circles')
    .select("*")
    .eq('baby_id', babyId);


  if (rep.error) throw rep.error
  return rep.data
}

// Called from every visibility-filtered list across the app (feed, albums,
// anecdotes, events, comments, stories — see grep for getUserCircleIds),
// often several times per page load. Cached the same way as getUserAccess
// (users.ts): React's cache() dedupes within one request, a short
// cross-request TTL absorbs a burst of viewers/actions hitting it within
// the same few seconds.
const circlesAccessCache = createTtlCache<Awaited<ReturnType<typeof fetchCirclesAccess>>>(5_000)

async function fetchCirclesAccess(babyId: string, userId: string) {
  const supabase = await createClient()

  const rep = await supabase
    .from('circles_access')
    .select("*")
    .eq('baby_id', babyId)
    .eq('user_id', userId)
    ;

  if (rep.error) throw rep.error
  return rep.data
}

export const getCirclesAccess = cache(async (babyId: string, userId: string) => {
  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  return circlesAccessCache.get(`${babyId}:${userId}`, () => fetchCirclesAccess(babyId, userId))
})

export async function getUserCircleIds(babyId: string, userId: string) {
  const access = await getCirclesAccess(babyId, userId)
  return access.map((a) => a.circle_id)
}

export async function getCircleMemberCounts(babyId: string): Promise<Record<string, number>> {
  const supabase = await createClient()

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const rep = await supabase
    .from('circles_access')
    .select('circle_id')
    .eq('baby_id', babyId)

  if (rep.error) throw rep.error

  const counts: Record<string, number> = {}
  for (const { circle_id } of rep.data) {
    counts[circle_id] = (counts[circle_id] ?? 0) + 1
  }
  return counts
}

export async function getAllCirclesAccess(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')

  const rep = await supabase
    .from('circles_access')
    .select("*")
    .eq('baby_id', babyId);

  if (rep.error) throw rep.error
  return rep.data
}

export async function addUserToCircle(circleId: string, userId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addUserToCircle.name, babyId, circleId, userId })
  await assertIsAdmin(supabase, babyId)

  const rep = await supabase
    .from('circles_access')
    .insert([{ circle_id: circleId, user_id: userId, baby_id: babyId }])

  if (rep.error) throw rep.error

  const { data: circle } = await supabase
    .from('circles')
    .select('name')
    .eq('id', circleId)
    .single()

  const t = await getTranslations('pushNotifications')
  await notifyUsers(babyId, 'circle_access_granted', {
    title: t('circleAccessGranted.title'),
    body: circle?.name
      ? t('circleAccessGranted.bodyNamed', { circleName: circle.name })
      : t('circleAccessGranted.bodyGeneric'),
    url: `/baby/${babyId}/feed`,
  }, [userId])

  contextLogger.info("User added to circle")

  revalidatePath(`/baby/${babyId}/admin`)
  revalidatePath(`/baby/${babyId}/feed`)
}

export async function removeUserFromCircle(circleId: string, userId: string, babyId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const rep = await supabase
    .from('circles_access')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .eq('baby_id', babyId)

  if (rep.error) throw rep.error

  revalidatePath(`/baby/${babyId}/admin`)
}
