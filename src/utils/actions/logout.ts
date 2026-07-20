'use server'

import { createClient } from '@utils/supabase/server'
import { redirect } from 'next/navigation'

export async function logout() {
  const supabase = await createClient()

  // On supprime la session côté Supabase et on efface les cookies
  await supabase.auth.signOut()

  // On redirige l'utilisateur vers la page d'accueil ou de login
  redirect('/')
}
