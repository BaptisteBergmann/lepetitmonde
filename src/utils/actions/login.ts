'use server'

import { createClient } from '@utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'
import { safeRedirectPath } from '@/utils/safe-redirect'
import { hitLoginLimiters, resetStrictLoginLimiter } from '@/utils/login-limiters'
import { getClientIp } from '@/utils/client-ip'
import { logger } from '@/utils/logger'

export async function login(formData: FormData) {
  const contextLogger = logger.child({ function: login.name })
  const supabase = await createClient()

  // On récupère les données du formulaire
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = safeRedirectPath(formData.get('redirectTo'))

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const ip = getClientIp(await headers()) ?? 'unknown'
  const blocked = hitLoginLimiters(normalizedEmail, ip)
  if (blocked) {
    // No email and no IP in the log on purpose.
    contextLogger.warn({ reason: blocked }, 'Login throttled')
    const t = await getTranslations('auth')
    const params = new URLSearchParams({ message: t('tooManyAttempts') })
    if (redirectTo !== '/') params.set('redirectTo', redirectTo)
    return redirect(`/login?${params.toString()}`)
  }

  // On tente de se connecter via Supabase
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // S'il y a une erreur (mauvais mot de passe, etc.), on renvoie vers le login avec un message d'erreur
  if (error) {
    const t = await getTranslations('auth')
    const params = new URLSearchParams({ message: t('invalidCredentials') })
    if (redirectTo !== '/') params.set('redirectTo', redirectTo)
    return redirect(`/login?${params.toString()}`)
  }

  resetStrictLoginLimiter(normalizedEmail, ip)

  // Si ça marche, on rafraîchit le cache Next.js et on redirige vers la page d'origine (ou l'accueil)
  revalidatePath('/', 'layout')
  redirect(redirectTo)
}
