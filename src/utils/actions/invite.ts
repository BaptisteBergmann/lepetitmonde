'use server'

import { createClient } from '@utils/supabase/server'
import { logger } from '@/utils/logger'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'
import { sendInviteEmail } from '@/utils/email'
import { actionError } from './errors'
import { INVITE_DURATIONS_HOURS, isInviteDurationHours } from '@/utils/invite-limits'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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


export async function generateShortLivedLink(babyId: string, hoursValid: number = INVITE_DURATIONS_HOURS[0]) {
  const contextLogger = logger.child({ function: generateShortLivedLink.name, babyId })
  const supabase = await createClient();
  await assertIsAdmin(supabase, babyId)

  // Client-supplied: only the fixed durations are allowed.
  if (!isInviteDurationHours(hoursValid)) throw await actionError('invalidInviteDuration')

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
    .select('id, created_at, expires_at, used_at, revoked_at, used_by, users:used_by(first_name, last_name)')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })

  if (error) { contextLogger.error(error, "Error fetching invitations"); return [] }

  return data
}

export async function revokeInvitation(babyId: string, invitationId: string) {
  const contextLogger = logger.child({ function: revokeInvitation.name, babyId, invitationId })
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  if (typeof invitationId !== 'string' || !UUID_RE.test(invitationId)) {
    throw await actionError('invitationNotFound')
  }

  // The baby_id filter stops an admin of one baby revoking another's links.
  const { data, error } = await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('baby_id', babyId)
    .is('revoked_at', null)
    .select('id')

  if (error) {
    contextLogger.error(error, 'Error revoking invitation')
    throw await actionError('inviteError')
  }
  if (!data || data.length === 0) throw await actionError('invitationNotFound')

  contextLogger.info('Invitation revoked')
  revalidatePath(`/baby/${babyId}/admin`)
}
