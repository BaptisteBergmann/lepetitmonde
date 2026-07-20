'use server'

import { createClient } from '@utils/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { logger } from '../logger'

export async function requestPasswordReset(formData: FormData) {
  const contextLogger = logger.child({ function: requestPasswordReset.name })
  const supabase = await createClient()

  const email = formData.get('email') as string
  const origin = (await headers()).get('origin')

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  })

  if (error) {
    contextLogger.error(error, "Password reset request failed")
  }

  // Le même message est renvoyé que l'email existe ou non, pour ne pas révéler
  // quels emails sont enregistrés (énumération de comptes).
  redirect('/forgot-password?message=Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.')
}

export async function updatePassword(formData: FormData) {
  const contextLogger = logger.child({ function: updatePassword.name })
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?message=Session expirée, veuillez recommencer.')
  }

  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (password !== confirmPassword) {
    redirect('/reset-password?message=Les mots de passe ne correspondent pas')
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    contextLogger.error(error, "Password update failed")
    redirect('/reset-password?message=Erreur lors de la mise à jour du mot de passe')
  }

  await supabase.auth.signOut()
  redirect('/login?message=Mot de passe mis à jour, vous pouvez vous connecter')
}
