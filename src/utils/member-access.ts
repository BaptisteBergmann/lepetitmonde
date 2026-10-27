// Deliberately NOT a 'use server' module: every function takes a userId and
// trusts it, so exporting them from an action file would make each one a
// publicly callable endpoint. They take the Supabase client as a parameter so
// the cookie-bound server actions and the MCP endpoint (service-role client,
// user id from a verified API token) apply one and the same rule. Only import
// from server code that has already authenticated the user.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Enums } from '@utils/supabase/database.types'
import { actionError } from './actions/errors'
import { logger } from './logger'
import { PAGE_REGISTRY, type PageId } from './page_registry'

type AccessLevel = Enums<'role'>

export type PageOverride = { enabled: boolean; required_role: AccessLevel }

// The access level of `userId` on `babyId`, or null when not a member.
export async function getMemberAccess(supabase: SupabaseClient, userId: string, babyId: string): Promise<AccessLevel | null> {
  const contextLogger = logger.child({ function: getMemberAccess.name, babyId })
  const { data, error } = await supabase
    .from('baby_access')
    .select('access_level')
    .eq('baby_id', babyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) { contextLogger.error(error, "Error fetching member access"); return null }
  return (data?.access_level as AccessLevel | undefined) ?? null
}

// Pure page rule: the page is enabled (override or registry default) and the
// member is admin or has exactly the page's required role. `admin` is always
// enabled and admin-only whatever the DB says.
export function canAccessPage(
  entry: { id: PageId; defaultRole: AccessLevel; defaultEnabled: boolean },
  override: PageOverride | null | undefined,
  level: AccessLevel | null | undefined,
): boolean {
  if (!level) return false
  if (entry.id === 'admin') return level === 'admin'

  const enabled = override?.enabled ?? entry.defaultEnabled
  const role = override?.required_role ?? entry.defaultRole
  return enabled && (level === 'admin' || level === role)
}

// Same answer as hasPageAccess, for an explicit user. A non-member, a disabled
// page and a wrong role all fail the same way. Returns the access level.
export async function assertPageAccessForUser(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  pageId: PageId,
): Promise<AccessLevel> {
  const contextLogger = logger.child({ function: assertPageAccessForUser.name, babyId, pageId })

  const entry = PAGE_REGISTRY.find((page) => page.id === pageId)
  const level = await getMemberAccess(supabase, userId, babyId)
  if (!entry || !level) throw await actionError('unauthorized')

  const { data: override, error } = await supabase
    .from('page_settings')
    .select('enabled, required_role')
    .eq('baby_id', babyId)
    .eq('page_id', pageId)
    .maybeSingle()

  if (error) {
    contextLogger.error(error, "Error fetching page setting")
    throw await actionError('unauthorized')
  }

  if (!canAccessPage(entry, override as PageOverride | null, level)) {
    contextLogger.warn({ accessLevel: level }, "Blocked page access")
    throw await actionError('unauthorized')
  }
  return level
}

// Circles of `userId` in `babyId`. No caching, unlike getUserCircleIds.
export async function getViewerCircleIds(supabase: SupabaseClient, userId: string, babyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('circles_access')
    .select('circle_id')
    .eq('baby_id', babyId)
    .eq('user_id', userId)

  if (error) throw error
  return (data ?? []).map((row) => row.circle_id as string)
}

// Admins plus members of any of the target circles, minus `excludeUserId`.
// Same rule as the cookie-bound getVisibleUserIds (no circle = admins only).
export async function getVisibleUserIdsWith(
  supabase: SupabaseClient,
  babyId: string,
  circleIds: string[],
  excludeUserId?: string,
): Promise<string[]> {
  const { data: access } = await supabase
    .from('baby_access')
    .select('user_id, access_level')
    .eq('baby_id', babyId)

  const recipientIds = new Set(
    (access ?? [])
      .filter((row) => row.access_level === 'admin')
      .map((row) => row.user_id as string),
  )

  if (circleIds.length > 0) {
    const { data: circleMembers } = await supabase
      .from('circles_access')
      .select('user_id')
      .eq('baby_id', babyId)
      .in('circle_id', circleIds)

    for (const row of circleMembers ?? []) recipientIds.add(row.user_id as string)
  }

  if (excludeUserId) recipientIds.delete(excludeUserId)

  return Array.from(recipientIds)
}

export async function assertCirclesInBabyWith(supabase: SupabaseClient, circleIds: string[], babyId: string) {
  const unique = Array.from(new Set(circleIds))
  if (unique.length === 0) return

  const contextLogger = logger.child({ function: assertCirclesInBabyWith.name, babyId, circleCount: unique.length })

  const { data, error } = await supabase
    .from('circles')
    .select('id')
    .in('id', unique)
    .eq('baby_id', babyId)

  if (error) contextLogger.error(error, "Error checking circles")
  if (error || data.length !== unique.length) throw await actionError('unauthorized')
}
