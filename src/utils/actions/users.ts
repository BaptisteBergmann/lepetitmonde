'use server'

import { createClient } from '@utils/supabase/server'
import { logger } from '../logger';

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
