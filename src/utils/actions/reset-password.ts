'use server'

import { createClient } from '@utils/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { logger } from '../logger'
import { headers } from 'next/headers'
import { createRateLimiter } from '@/utils/rate-limit'
import { getClientIp } from '@/utils/client-ip'
import { isValidPasswordLength, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/utils/password-policy'

const HOUR_MS = 60 * 60 * 1000
// NOTE: the per-IP limit is bypassable until the L9 port bind ships (a
// request reaching the app port directly can forge cf-connecting-ip); the
// per-email limit is the guarantee until then.
const resetEmailLimiter = createRateLimiter({ windowMs: HOUR_MS, max: 3 })
const resetIpLimiter = createRateLimiter({ windowMs: HOUR_MS, max: 10 })

export async function requestPasswordReset(formData: FormData) {
  const contextLogger = logger.child({ function: requestPasswordReset.name })
  const supabase = await createClient()
  const t = await getTranslations('auth')

  const email = formData.get('email') as string

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const ip = getClientIp(await headers()) ?? 'unknown'
  const emailOk = resetEmailLimiter.hit(normalizedEmail)
  const ipOk = resetIpLimiter.hit(ip)
  if (!emailOk || !ipOk) {
    // Same "link sent" message as below so throttling doesn't reveal anything.
    contextLogger.warn({ reason: emailOk ? 'ip' : 'email' }, 'Password reset throttled')
    redirect(`/forgot-password?message=${encodeURIComponent(t('resetLinkSentMessage'))}`)
  }

  // SITE_URL, not the Origin header: the header is client-controlled.
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) {
    // Never build a link from "undefined"; keep the generic response so the
    // misconfiguration doesn't reveal anything to the caller.
    contextLogger.error('SITE_URL not set')
    redirect(`/forgot-password?message=${encodeURIComponent(t('resetLinkSentMessage'))}`)
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/reset-password`,
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

  if (!isValidPasswordLength(password)) {
    redirect(`/reset-password?message=${encodeURIComponent(t('passwordTooShort', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }))}`)
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    contextLogger.error(error, "Password update failed")
    redirect(`/reset-password?message=${encodeURIComponent(t('updatePasswordError'))}`)
  }

  await supabase.auth.signOut()
  redirect(`/login?message=${encodeURIComponent(t('passwordUpdatedMessage'))}`)
}
