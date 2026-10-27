// Deliberately NOT a 'use server' module: it trusts the userId it is given,
// so only import it from server code that has already authenticated the user.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertIsAdminForUser } from './actions/access'
import { actionError } from './actions/errors'
import { logger } from './logger'

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Admin only: circles decide who sees shared content, and are managed on the
// admin page (always enabled), so no page setting applies.
export async function listCirclesCore(supabase: SupabaseClient, userId: string, babyId: string): Promise<{ id: string; name: string }[]> {
  if (typeof babyId !== 'string' || !ID_RE.test(babyId)) throw await actionError('unauthorized')
  await assertIsAdminForUser(supabase, userId, babyId)

  const { data, error } = await supabase
    .from('circles')
    .select('id, name')
    .eq('baby_id', babyId)
    .order('name', { ascending: true })

  if (error) {
    logger.child({ function: listCirclesCore.name, babyId }).error(error, "Error fetching circles")
    throw error
  }
  return (data ?? []).map((circle) => ({ id: circle.id as string, name: circle.name as string }))
}
