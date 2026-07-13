'use server'

import { createClient } from '@utils/supabase/server'
import { logger } from '../logger';

export async function getUserAccess(babyId: string) {
  const supabase = await createClient();
  const contextLogger = logger.child({ function: getUserAccess.name, babyId })
  const { data: { user } } = await supabase.auth.getUser()
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
}

export async function getUsers(babyId: string) {
  const supabase = await createClient();
  const contextLogger = logger.child({ function: getUsers.name, babyId })
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
