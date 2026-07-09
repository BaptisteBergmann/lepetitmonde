'use server'

import { createClient } from '../supabase/server'

export async function getUsers(projectId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('project_access')
    .select('*')
    .eq('project_id', projectId);

  if (error) { console.log("Error get users", error); return [] }

  return data;
}
