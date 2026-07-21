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
    .map((access) => ({ ...access.users!, access_level: access.access_level }));
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

