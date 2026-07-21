'use server'

import { createClient } from '@utils/supabase/server'
import { logger } from '@/utils/logger'
import { revalidatePath } from 'next/cache'

async function assertIsAdmin(supabase: Awaited<ReturnType<typeof createClient>>, babyId: string) {
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

export async function sendInvite(formData: FormData) {
  const babyId = formData.get('babyId') as string

  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const rep = await supabase
    .from('invitations')
    .insert([{ baby_id: babyId, expires_at: expiresAt.toISOString() }])

  if (rep.error) throw new Error("Erreur lors de l'invitation")

  revalidatePath(`/baby/${babyId}/circles`)
}


export async function generateShortLivedLink(babyId: string, hoursValid: number = 24) {
  const contextLogger = logger.child({ function: generateShortLivedLink.name, babyId })
  const supabase = await createClient();
  await assertIsAdmin(supabase, babyId)

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hoursValid);

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      baby_id: babyId,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();

  if (error) { contextLogger.error(error, "Error generating link"); return }

  revalidatePath(`/baby/${babyId}/circles`)

  const shareableLink = `${process.env.NEXT_PUBLIC_SITE_URL}/signup?token=${data.id}`;

  return shareableLink;
}

export async function getInvitations(babyId: string) {
  const contextLogger = logger.child({ function: getInvitations.name, babyId })
  const supabase = await createClient();
  await assertIsAdmin(supabase, babyId)

  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })

  if (error) { contextLogger.error(error, "Error fetching invitations"); return [] }

  return data
}
