'use server'

import { createClient } from '@utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { logger } from '../logger'
import { sendWelcomeEmail } from '@/utils/email'
import { getBabyAdminIds } from './access'
import { notifyUsers } from './notify'
import { createUserProfile, findValidInvitation, grantViewerAccess } from '@utils/invitations'

export async function signup(formData: FormData) {
  const supabase = await createClient()

  // On récupère les données du formulaire
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const token = formData.get('token') as string

  const contextLogger = logger.child({ function: signup.name })
  const tAuth = await getTranslations('auth')

  // Re-checked here (not only on the invite page): the form posts the token
  // back, so it must be validated again before anything is created.
  const invitation = await findValidInvitation(token)

  if (!invitation) {
    return redirect(`/invite?message=${encodeURIComponent(tAuth('invalidOrExpiredLink'))}`)
  }

  // On tente de créer le compte via Supabase
  const { data: user, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name, // On stocke le nom dans les métadonnées de l'utilisateur
      },
    },
  })

  // S'il y a une erreur (email déjà utilisé, mot de passe trop faible, etc.)
  if (error || !user.user) {
    contextLogger.error(error, "Signup failed")
    return redirect(`/invite?token=${token}&message=${encodeURIComponent(tAuth('createAccountError'))}`)
  }

  const [firstName, ...rest] = name.trim().split(" ")
  const lastName = rest.length > 0 ? rest.join(" ") : null

  // Service role: right after signUp there may be no session yet (email
  // confirmation), and these rows are the new user's own. The id comes from
  // auth.signUp, never from the form.
  await createUserProfile(user.user.id, firstName, lastName)
  await grantViewerAccess(invitation, user.user.id)

  await sendWelcomeEmail(email, firstName)

  const adminIds = await getBabyAdminIds(invitation.babyId, user.user.id)
  const t = await getTranslations('pushNotifications')
  await notifyUsers(invitation.babyId, 'new_member', {
    title: t('newMember.title'),
    body: t('newMember.body', { name: firstName }),
    url: `/baby/${invitation.babyId}/admin`,
  }, adminIds)

  revalidatePath('/', 'layout')
  redirect(`/baby/${invitation.babyId}/onboarding`)
}
