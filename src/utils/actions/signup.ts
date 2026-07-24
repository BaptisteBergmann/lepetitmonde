'use server'

import { createClient } from '@utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logger } from '../logger'
import { sendWelcomeEmail } from '@/utils/email'
import { getBabyAdminIds } from './access'
import { notifyUsers } from './notify'

export async function signup(formData: FormData) {
  const supabase = await createClient()

  // On récupère les données du formulaire
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const token = formData.get('token') as string

  const contextLogger = logger.child({ function: signup.name })

  const invitation = await supabase
    .from('invitations')
    .select('*')
    .eq("id", token)
    .single();

  contextLogger.info(invitation, "Get invitation data")

  if (invitation.error || !invitation.data) {
    return redirect('/signup?message=Lien d\'invitation invalide ou expiré')
  }

  if (new Date(invitation.data.expires_at) < new Date()) {
    return redirect('/signup?message=Lien d\'invitation invalide ou expiré')
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
    return redirect('/signup?message=Erreur lors de la création du compte')
  }

  const [firstName, ...rest] = name.trim().split(" ")
  const lastName = rest.length > 0 ? rest.join(" ") : null

  const addUser = await supabase
    .from("users")
    .insert({
      first_name: firstName,
      last_name: lastName,
      id: user.user.id
    })

  contextLogger.info(addUser, "Add user")

  const access = await supabase
    .from('baby_access')
    .insert({
      user_id: user.user.id,
      baby_id: invitation.data.baby_id,
    })

  contextLogger.info(access, "Add access")

  await sendWelcomeEmail(email, firstName)

  const adminIds = await getBabyAdminIds(invitation.data.baby_id, user.user.id)
  await notifyUsers(invitation.data.baby_id, 'new_member', {
    title: 'Nouveau membre',
    body: `${firstName} a rejoint la famille !`,
    url: `/baby/${invitation.data.baby_id}/admin`,
  }, adminIds)

  revalidatePath('/', 'layout')
  redirect(`/baby/${invitation.data.baby_id}/onboarding`)
}
