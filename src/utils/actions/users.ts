'use server'

import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Enums } from '@utils/supabase/database.types'
import { logger } from '../logger';
import { assertIsAdmin } from './access'

export const getUserAccess = cache(async (babyId: string) => {
  const supabase = await createClient();
  const contextLogger = logger.child({ function: 'getUserAccess', babyId })
  const { data: { user } } = await getAuthUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('baby_access') // Assurez-vous du nom exact de votre table
    .select(`*`)
    .eq('baby_id', babyId)
    .eq('user_id', user.id)
    .single();

  if (error) { contextLogger.error(error, "Error get user access"); return [] }

  contextLogger.debug(data, "User access received")

  return data;
})

export async function getAllUserAccess() {
  const supabase = await createClient();
  const contextLogger = logger.child({ function: getAllUserAccess.name })
  const { data: { user } } = await getAuthUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('baby_access') // Assurez-vous du nom exact de votre table
    .select(`*`)
    .eq('user_id', user.id);

  if (error) { contextLogger.error(error, "Error get all user access"); return [] }

  contextLogger.debug(data, "All User access received")

  return data;
}


export async function getUsers(babyId: string) {
  const supabase = await createClient();
  const contextLogger = logger.child({ function: getUsers.name, babyId })
  const { data: { user } } = await getAuthUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('baby_access') // Assurez-vous du nom exact de votre table
    .select(`
      *,
      users (*)
    `)
    .eq('baby_id', babyId);

  if (error) { contextLogger.error(error, "Error get users"); return [] }

  contextLogger.debug(data, "Users received")

  return data
    .filter((access) => access.users)
    .map((access) => ({ ...access.users!, nickname: access.nickname, access_level: access.access_level }));
}

// One nickname lookup per baby, used wherever a display name needs to be
// resolved for several users at once (reactions, post views, poll voters,
// bug reports) — nickname lives on baby_access (per user+baby), not on users.
export async function getNicknamesByBaby(babyId: string): Promise<Record<string, string | null>> {
  const supabase = await createClient();
  const contextLogger = logger.child({ function: getNicknamesByBaby.name, babyId })
  const { data, error } = await supabase
    .from('baby_access')
    .select('user_id, nickname')
    .eq('baby_id', babyId);

  if (error) { contextLogger.error(error, "Error fetching nicknames"); return {} }

  return Object.fromEntries(data.map((row) => [row.user_id, row.nickname]))
}

export async function updateUserAccessLevel(babyId: string, userId: string, accessLevel: Enums<'role'>) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateUserAccessLevel.name, babyId, userId })
  await assertIsAdmin(supabase, babyId)

  if (accessLevel !== 'admin') {
    const { data: target, error: targetError } = await supabase
      .from('baby_access')
      .select('access_level')
      .eq('baby_id', babyId)
      .eq('user_id', userId)
      .single()

    if (targetError) { contextLogger.error(targetError, "Error fetching target access"); throw targetError }

    if (target.access_level === 'admin') {
      const { count, error: countError } = await supabase
        .from('baby_access')
        .select('*', { count: 'exact', head: true })
        .eq('baby_id', babyId)
        .eq('access_level', 'admin')

      if (countError) { contextLogger.error(countError, "Error counting admins"); throw countError }

      if ((count ?? 0) <= 1) {
        throw new Error("Impossible de retirer le dernier administrateur de ce journal.")
      }
    }
  }

  const { error } = await supabase
    .from('baby_access')
    .update({ access_level: accessLevel })
    .eq('baby_id', babyId)
    .eq('user_id', userId)

  if (error) { contextLogger.error(error, "Error updating user access level"); throw error }

  contextLogger.info({ accessLevel }, "User access level updated")

  revalidatePath(`/baby/${babyId}/admin`)
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateProfile.name })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const firstName = (formData.get('firstName') as string || '').trim()
  const lastName = (formData.get('lastName') as string || '').trim()

  const { error: profileError } = await supabase
    .from('users')
    .update({ first_name: firstName || null, last_name: lastName || null })
    .eq('id', user.id)

  if (profileError) { contextLogger.error(profileError, "Error updating profile"); throw profileError }

  // Keeps user_metadata.full_name (used as a display-name fallback) in sync;
  // best-effort since the profile update above already succeeded.
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const { error: authError } = await supabase.auth.updateUser({ data: { full_name: fullName } })
  if (authError) contextLogger.error(authError, "Error syncing full_name to auth metadata")

  contextLogger.info("Profile updated")

  revalidatePath('/settings')
}

export async function requestEmailChange(formData: FormData) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: requestEmailChange.name })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const email = (formData.get('email') as string || '').trim()
  if (!email) throw new Error("Adresse email requise")

  const { error } = await supabase.auth.updateUser({ email })
  if (error) { contextLogger.error(error, "Error requesting email change"); throw error }

  contextLogger.info("Email change requested")
}

export async function updateBabyAccessSettings(babyId: string, formData: FormData) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateBabyAccessSettings.name, babyId })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const nickname = (formData.get('nickname') as string || '').trim()
  const relationToBaby = (formData.get('relationToBaby') as string || '').trim()

  const { error } = await supabase
    .from('baby_access')
    .update({ nickname: nickname || null, relation_to_baby: relationToBaby })
    .eq('baby_id', babyId)
    .eq('user_id', user.id)

  if (error) { contextLogger.error(error, "Error updating baby access settings"); throw error }

  contextLogger.info({ nickname, relationToBaby }, "Baby access settings updated")

  revalidatePath('/settings')
}

export async function getUser(babyId: string) {
  const supabase = await createClient();
  const contextLogger = logger.child({ function: getUser.name, babyId })
  const { data: { user } } = await getAuthUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('baby_access') // Assurez-vous du nom exact de votre table
    .select(`
      *,
      users (*)
    `)
    .eq('baby_id', babyId)
    .eq('user_id', user.id);

  if (error) { contextLogger.error(error, "Error get users"); return [] }

  contextLogger.debug(data, "Users received")

  return data.map((access) => access.users);
}

