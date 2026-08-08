'use server'

import { createClient } from '@utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logger } from '../logger'
import { getBabyAdminIds } from './access'
import { notifyUsers } from './notify'

// Redeems an invitation for a user who is already logged in (e.g. they
// already have access to another baby). Mirrors signup()'s invitation
// handling but skips account creation and only grants baby_access.
export async function joinBabyWithInvitation(formData: FormData) {
  const token = formData.get('token') as string
  const contextLogger = logger.child({ function: joinBabyWithInvitation.name })

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return redirect(`/login?redirectTo=${encodeURIComponent(`/invite?token=${token}`)}`)
  }

  const invitation = await supabase
    .from('invitations')
    .select('*')
    .eq('id', token)
    .single()

  if (invitation.error || !invitation.data) {
    return redirect('/invite?message=Lien d\'invitation invalide ou expiré')
  }

  if (new Date(invitation.data.expires_at) < new Date()) {
    return redirect('/invite?message=Lien d\'invitation invalide ou expiré')
  }

  const babyId = invitation.data.baby_id

  const existingAccess = await supabase
    .from('baby_access')
    .select('user_id')
    .eq('baby_id', babyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingAccess.data) {
    return redirect(`/baby/${babyId}`)
  }

  const { error: accessError } = await supabase
    .from('baby_access')
    .insert({ user_id: user.id, baby_id: babyId })

  if (accessError) {
    contextLogger.error(accessError, "Error adding baby access for existing user")
    return redirect(`/invite?token=${token}&message=Erreur lors de l\'ajout de l\'accès`)
  }

  const { data: profile } = await supabase
    .from('users')
    .select('first_name')
    .eq('id', user.id)
    .single()

  const adminIds = await getBabyAdminIds(babyId, user.id)
  await notifyUsers(babyId, 'new_member', {
    title: 'Nouveau membre',
    body: `${profile?.first_name ?? 'Un membre'} a rejoint la famille !`,
    url: `/baby/${babyId}/admin`,
  }, adminIds)

  revalidatePath('/', 'layout')
  redirect(`/baby/${babyId}/onboarding`)
}
