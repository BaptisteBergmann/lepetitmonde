'use server'

import { createClient } from '@utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = await createClient()

  // On récupère les données du formulaire
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // On tente de se connecter via Supabase
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // S'il y a une erreur (mauvais mot de passe, etc.), on renvoie vers le login avec un message d'erreur
  if (error) {
    return redirect('/login?message=Identifiants incorrects ou compte inexistant')
  }

  // Si ça marche, on rafraîchit le cache Next.js et on redirige vers l'accueil (la Timeline)
  revalidatePath('/', 'layout')
  redirect('/')
}
