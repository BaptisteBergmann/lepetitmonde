'use server'

import { createClient } from '@utils/supabase/server'

export async function assertIsAdmin(supabase: Awaited<ReturnType<typeof createClient>>, babyId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const { data: access, error } = await supabase
    .from('baby_access')
    .select('access_level')
    .eq('baby_id', babyId)
    .eq('user_id', user.id)
    .single()

  if (error || !access || access.access_level !== 'admin') {
    throw new Error("Non autorisé")
  }
}
