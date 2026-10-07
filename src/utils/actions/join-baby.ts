'use server'

import { createClient } from '@utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { logger } from '../logger'
import { getBabyAdminIds } from './access'
import { notifyUsers } from './notify'
import { findValidInvitation, grantViewerAccess } from '@utils/invitations'

// Redeems an invitation for a user who is already logged in (e.g. they
// already have access to another baby). Mirrors signup()'s invitation
// handling but skips account creation and only grants baby_access.
export async function joinBabyWithInvitation(formData: FormData) {
  const token = formData.get('token') as string
  const contextLogger = logger.child({ function: joinBabyWithInvitation.name })

  const supabase = await createClient()
  const tAuth = await getTranslations('auth')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return redirect(`/login?redirectTo=${encodeURIComponent(`/invite?token=${token}`)}`)
  }

  const invitation = await findValidInvitation(token)

  if (!invitation) {
    return redirect(`/invite?message=${encodeURIComponent(tAuth('invalidOrExpiredLink'))}`)
  }

  const babyId = invitation.babyId

  const existingAccess = await supabase
    .from('baby_access')
    .select('user_id')
    .eq('baby_id', babyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingAccess.data) {
    return redirect(`/baby/${babyId}`)
  }

  // Service role: the caller isn't a member of this baby yet. The user id is
  // the verified getUser() one and the baby comes from the validated token.
  const { error: accessError } = await grantViewerAccess(invitation, user.id)

  if (accessError) {
    contextLogger.error({ babyId }, "Error adding baby access for existing user")
    return redirect(`/invite?token=${token}&message=${encodeURIComponent(tAuth('addAccessError'))}`)
  }

  const { data: profile } = await supabase
    .from('users')
    .select('first_name')
    .eq('id', user.id)
    .single()

  const adminIds = await getBabyAdminIds(babyId, user.id)
  const t = await getTranslations('pushNotifications')
  await notifyUsers(babyId, 'new_member', {
    title: t('newMember.title'),
    body: t('newMember.body', { name: profile?.first_name ?? t('newMember.unnamedFallback') }),
    url: `/baby/${babyId}/admin`,
  }, adminIds)

  revalidatePath('/', 'layout')
  redirect(`/baby/${babyId}/onboarding`)
}
