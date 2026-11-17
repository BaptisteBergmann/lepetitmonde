'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { cache } from 'react'
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Tables, TablesInsert } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { logger } from '../logger'
import { assertIsAdmin, getAllBabyMemberIds } from './access'
import { assertCirclesInBabyWith, getCircleParentsWith } from '../member-access'
import { getUserAccess } from './users'
import { notifyUsers } from './notify'
import { actionError } from './errors'
import { normalizeText } from '@utils/feed-validation'
import { INPUT_LIMITS } from '@utils/input-limits'
import { createTtlCache } from '../cache/ttl-cache'
import { CIRCLE_MAX_DEPTH, ancestorsOrSelf, depthOf, descendantsOrSelf, rootOf, subtreeHeight } from '../circle-tree'
import { getCircleParents } from '../circle-parents'

type NewCircle = TablesInsert<'circles'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function assertUuid(value: unknown): Promise<string> {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw await actionError('unauthorized')
  return value
}

export type CircleErrorKey = 'circleHierarchyCycle' | 'circleHierarchyDepth' | 'circleMembershipSameTree' | 'circleMembershipConflict'
export type CircleActionResult = { error?: CircleErrorKey }

// Known hierarchy/membership failures travel back as data ({ error: <serverErrors key> }):
// Next masks the message of a thrown error in production, so the client translates the key.
class CircleKeyError extends Error {
  constructor(readonly key: CircleErrorKey) { super(key) }
}

// The database triggers have the final say on tree shape and "one circle per tree";
// they raise stable message prefixes. Anything else is rethrown untouched, as before.
function throwMappedCircleError(error: { message?: string }): never {
  const message = error.message ?? ''
  if (message.includes('circle_hierarchy_cycle')) throw new CircleKeyError('circleHierarchyCycle')
  if (message.includes('circle_hierarchy_depth')) throw new CircleKeyError('circleHierarchyDepth')
  if (message.includes('circle_membership_same_tree')) throw new CircleKeyError('circleMembershipSameTree')
  if (message.includes('circle_membership_conflict')) throw new CircleKeyError('circleMembershipConflict')
  throw error
}

async function toResult(run: () => Promise<void>): Promise<CircleActionResult> {
  try {
    await run()
    return {}
  } catch (error) {
    if (error instanceof CircleKeyError) return { error: error.key }
    throw error
  }
}

// Form-action path (admin "create circle" card): must return void, so known errors are thrown.
export async function createCircle(circle: FormData) {
  try {
    await insertCircle(circle)
  } catch (error) {
    if (error instanceof CircleKeyError) throw await actionError(error.key)
    throw error
  }
}

// Sub-circle dialog path: reports known errors as data.
export async function createSubCircle(circle: FormData): Promise<CircleActionResult> {
  return toResult(() => insertCircle(circle))
}

async function insertCircle(circle: FormData) {
  const supabase = await createClient()

  const babyId = await assertUuid(circle.get("babyId"))
  const name = circle.get("name") as string
  const rawParent = circle.get("parentId")
  const parentId = typeof rawParent === 'string' && rawParent !== '' ? await assertUuid(rawParent) : null

  await assertIsAdmin(supabase, babyId)

  const validName = await normalizeText(name, INPUT_LIMITS.circleName, { requiredKey: 'textRequired' })

  if (parentId) {
    await assertCirclesInBabyWith(supabase, [parentId], babyId)
    const nodes = await getCircleParentsWith(supabase, babyId)
    if (depthOf(parentId, nodes) + 1 > CIRCLE_MAX_DEPTH) throw new CircleKeyError('circleHierarchyDepth')
  }

  const rep = await supabase
    .from('circles')
    .insert([{ name: validName, baby_id: babyId, parent_circle: parentId }])

  if (rep.error) throwMappedCircleError(rep.error)

  revalidatePath(`/baby/${babyId}/admin`)
}

// Moving a circle changes who can see everything already shared with it (and with its
// new/old ancestors), so the whole baby layout is revalidated, not just the admin page.
export async function setCircleParent(circleId: string, parentId: string | null, babyId: string): Promise<CircleActionResult> {
  return toResult(() => applyCircleParent(circleId, parentId, babyId))
}

async function applyCircleParent(circleId: string, parentId: string | null, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: 'setCircleParent', babyId, circleId, parentId })

  await assertUuid(babyId)
  await assertUuid(circleId)
  if (parentId !== null) await assertUuid(parentId)

  await assertIsAdmin(supabase, babyId)
  await assertCirclesInBabyWith(supabase, parentId ? [circleId, parentId] : [circleId], babyId)

  if (parentId) {
    // Friendly pre-check on the live tree (uncached: admins edit in quick succession); the
    // trigger is the real guard against races.
    const nodes = await getCircleParentsWith(supabase, babyId)
    if (descendantsOrSelf([circleId], nodes).has(parentId)) throw new CircleKeyError('circleHierarchyCycle')
    if (depthOf(parentId, nodes) + subtreeHeight(circleId, nodes) > CIRCLE_MAX_DEPTH) throw new CircleKeyError('circleHierarchyDepth')
  }

  const rep = await supabase
    .from('circles')
    .update({ parent_circle: parentId })
    .eq('id', circleId)
    .eq('baby_id', babyId)

  if (rep.error) {
    contextLogger.warn({ error: rep.error.message }, "Circle move rejected")
    throwMappedCircleError(rep.error)
  }

  contextLogger.info("Circle moved")
  revalidatePath(`/baby/${babyId}`, 'layout')
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

  // Children move up and members lose access: visibility changes on every page.
  revalidatePath(`/baby/${babyId}`, 'layout')
}

type Circle = Tables<'circles'>;

// Inline membership check (getUserAccess) instead of assertMember from
// feed-access: feed-access imports this module, and assertMember goes through
// getUserCircleIds -> getCirclesAccess, so using it here would recurse.
async function assertBabyMember(babyId: string) {
  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')
  return access
}

export async function getCircles(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')
  await assertBabyMember(babyId)

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

  // Checked before the cache: it is keyed by baby:user and would otherwise
  // serve a non-member (or a non-admin asking about someone else).
  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) return []
  if (userId !== user.id && access.access_level !== 'admin') throw await actionError('unauthorized')

  return circlesAccessCache.get(`${babyId}:${userId}`, () => fetchCirclesAccess(babyId, userId))
})

// EFFECTIVE circles: the direct ones plus their ancestors, so an item tagged "Family" is
// visible to someone who is only in "Grandparents" (a sub-circle of Family). Callers match
// an item's circle ids against this set.
export async function getUserCircleIds(babyId: string, userId: string) {
  const access = await getCirclesAccess(babyId, userId)
  if (access.length === 0) return []
  const nodes = await getCircleParents(babyId)
  return Array.from(ancestorsOrSelf(access.map((a) => a.circle_id), nodes))
}

// The circles the user is a direct member of. Comments stamp these (not the effective
// set) so moving circles later still resolves through the tree at read time.
export async function getDirectCircleIds(babyId: string, userId: string) {
  const access = await getCirclesAccess(babyId, userId)
  return access.map((a) => a.circle_id)
}

// People who see something shared with each circle: distinct direct members of the
// circle and everything below it. Admins are not counted (they see everything).
export async function getCircleMemberCounts(babyId: string): Promise<Record<string, number>> {
  const supabase = await createClient()

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')
  await assertBabyMember(babyId)

  const [rep, nodes] = await Promise.all([
    supabase
      .from('circles_access')
      .select('circle_id, user_id')
      .eq('baby_id', babyId),
    getCircleParents(babyId),
  ])

  if (rep.error) throw rep.error

  const membersByCircle = new Map<string, Set<string>>()
  for (const { circle_id, user_id } of rep.data) {
    const set = membersByCircle.get(circle_id)
    if (set) set.add(user_id)
    else membersByCircle.set(circle_id, new Set([user_id]))
  }

  const counts: Record<string, number> = {}
  for (const { id } of nodes) {
    const audience = new Set<string>()
    for (const circleId of descendantsOrSelf([id], nodes)) {
      for (const userId of membersByCircle.get(circleId) ?? []) audience.add(userId)
    }
    counts[id] = audience.size
  }
  return counts
}

export async function getAllCirclesAccess(babyId: string) {
  const supabase = await createClient()

  await assertIsAdmin(supabase, babyId)

  const rep = await supabase
    .from('circles_access')
    .select("*")
    .eq('baby_id', babyId);

  if (rep.error) throw rep.error
  return rep.data
}

export async function addUserToCircle(circleId: string, userId: string, babyId: string): Promise<CircleActionResult> {
  return toResult(() => insertCircleMember(circleId, userId, babyId))
}

async function insertCircleMember(circleId: string, userId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: 'addUserToCircle', babyId, circleId, userId })
  await assertIsAdmin(supabase, babyId)

  // Inline instead of assertCirclesInBaby: feed-access imports this module.
  const { data: circle, error: circleError } = await supabase
    .from('circles')
    .select('name')
    .eq('id', circleId)
    .eq('baby_id', babyId)
    .maybeSingle()

  if (circleError) { contextLogger.error(circleError, "Error checking circle"); throw circleError }
  if (!circle) {
    contextLogger.warn("Circle not found in baby")
    throw await actionError('unauthorized')
  }

  const memberIds = await getAllBabyMemberIds(babyId)
  if (!memberIds.includes(userId)) {
    contextLogger.warn("Target user is not a member of the baby")
    throw await actionError('unauthorized')
  }

  const rep = await supabase
    .from('circles_access')
    .insert([{ circle_id: circleId, user_id: userId, baby_id: babyId }])

  if (rep.error) throwMappedCircleError(rep.error)

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

// Moves a member from one circle to another circle of the same tree in a single UPDATE,
// so the "one circle per tree" trigger sees it as one atomic change (no gap where the
// person has no access, no window for a duplicate).
export async function moveCircleMember(input: { babyId: string; accessId: number; toCircleId: string }): Promise<CircleActionResult> {
  return toResult(() => applyCircleMemberMove(input))
}

async function applyCircleMemberMove({ babyId, accessId, toCircleId }: { babyId: string; accessId: number; toCircleId: string }) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: 'moveCircleMember', babyId, accessId, toCircleId })

  await assertUuid(babyId)
  await assertUuid(toCircleId)
  if (!Number.isSafeInteger(accessId) || accessId <= 0) throw await actionError('unauthorized')

  await assertIsAdmin(supabase, babyId)
  await assertCirclesInBabyWith(supabase, [toCircleId], babyId)

  const { data: row, error: rowError } = await supabase
    .from('circles_access')
    .select('circle_id')
    .eq('id', accessId)
    .eq('baby_id', babyId)
    .maybeSingle()

  if (rowError) { contextLogger.error(rowError, "Error reading membership"); throw rowError }
  if (!row) throw await actionError('unauthorized')

  // This action only moves within a tree; the trigger alone would also accept a jump to another tree.
  const nodes = await getCircleParentsWith(supabase, babyId)
  if (rootOf(row.circle_id, nodes) !== rootOf(toCircleId, nodes)) throw await actionError('unauthorized')

  const rep = await supabase
    .from('circles_access')
    .update({ circle_id: toCircleId })
    .eq('id', accessId)
    .eq('baby_id', babyId)
    .select('id')

  if (rep.error) {
    contextLogger.warn({ error: rep.error.message }, "Member move rejected")
    throwMappedCircleError(rep.error)
  }
  if (!rep.data || rep.data.length === 0) throw await actionError('unauthorized')

  contextLogger.info("Circle member moved")
  revalidatePath(`/baby/${babyId}`, 'layout')
}
