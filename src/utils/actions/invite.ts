'use server'

import { createClient } from '@utils/supabase/server'
import { logger } from '@/utils/logger'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'
import { sendInviteEmail } from '@/utils/email'
import { actionError } from './errors'

export async function sendInvite(formData: FormData) {
  const babyId = formData.get('babyId') as string
  const email = formData.get('email') as string
  const contextLogger = logger.child({ function: sendInvite.name, babyId })

  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  if (!email) throw await actionError('emailRequired')

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { data: baby, error: babyError } = await supabase
    .from('babies')
    .select('baby_surname')
    .eq('id', babyId)
    .single()

  if (babyError) {
    contextLogger.error(babyError, "Error fetching baby for invite email")
    throw await actionError('inviteError')
  }

  const { data: invitation, error } = await supabase
    .from('invitations')
    .insert([{ baby_id: babyId, expires_at: expiresAt.toISOString() }])
    .select('id')
    .single()

  if (error) {
    contextLogger.error(error, "Error creating invitation")
    throw await actionError('inviteError')
  }

  const inviteUrl = `${process.env.SITE_URL}/invite?token=${invitation.id}`
  await sendInviteEmail(email, baby.baby_surname, inviteUrl)

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

  const shareableLink = `${process.env.SITE_URL}/invite?token=${data.id}`;

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
