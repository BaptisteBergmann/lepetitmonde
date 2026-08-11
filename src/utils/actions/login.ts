'use server'

import { createClient } from '@utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

// N'autorise que les chemins relatifs internes (évite les open redirects du type
// "//evil.com" ou "/\evil.com" qui sont interprétés comme des URLs absolues par le navigateur).
function safeRedirectPath(path: FormDataEntryValue | null): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
    return '/'
  }
  return path
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  // On récupère les données du formulaire
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = safeRedirectPath(formData.get('redirectTo'))

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

  // Si ça marche, on rafraîchit le cache Next.js et on redirige vers la page d'origine (ou l'accueil)
  revalidatePath('/', 'layout')
  redirect(redirectTo)
}
