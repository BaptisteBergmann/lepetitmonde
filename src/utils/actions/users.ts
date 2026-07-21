'use server'

import { cache } from 'react'
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { logger } from '../logger';

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

  return data.map((access) => access.users);
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

