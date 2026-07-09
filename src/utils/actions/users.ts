'use server'

import { createClient } from '@utils/supabase/server'

export async function getUsers(babyId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('baby_access')
    .select('*')
    .eq('baby_id', babyId);

  if (error) { console.log("Error get users", error); return [] }

  return data;
}
