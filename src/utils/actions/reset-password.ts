'use server'

import { createClient } from '@utils/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { logger } from '../logger'

export async function requestPasswordReset(formData: FormData) {
  const contextLogger = logger.child({ function: requestPasswordReset.name })
  const supabase = await createClient()
  const t = await getTranslations('auth')

  const email = formData.get('email') as string
  const origin = (await headers()).get('origin')

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  })

  if (error) {
    contextLogger.error(error, "Password reset request failed")
  }

  // Same message whether the email exists or not, to avoid leaking which
  // emails are registered (account enumeration).
  redirect(`/forgot-password?message=${encodeURIComponent(t('resetLinkSentMessage'))}`)
}

export async function updatePassword(formData: FormData) {
  const contextLogger = logger.child({ function: updatePassword.name })
  const supabase = await createClient()
  const t = await getTranslations('auth')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/login?message=${encodeURIComponent(t('sessionExpiredMessage'))}`)
  }

  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (password !== confirmPassword) {
    redirect(`/reset-password?message=${encodeURIComponent(t('passwordMismatch'))}`)
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    contextLogger.error(error, "Password update failed")
    redirect(`/reset-password?message=${encodeURIComponent(t('updatePasswordError'))}`)
  }

  await supabase.auth.signOut()
  redirect(`/login?message=${encodeURIComponent(t('passwordUpdatedMessage'))}`)
}
