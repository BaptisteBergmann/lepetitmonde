'use server'

import { createClient } from '@utils/supabase/server'
import { logger } from '@/utils/logger'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'

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

  revalidatePath(`/baby/${babyId}/admin`)
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

  revalidatePath(`/baby/${babyId}/admin`)

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
