'use server'

import { createClient } from '@/src/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'


export async function signup(formData: FormData) {
  const supabase = await createClient()

  // On récupère les données du formulaire
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // On tente de créer le compte via Supabase
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name, // On stocke le nom dans les métadonnées de l'utilisateur
      },
    },
  })

  // S'il y a une erreur (email déjà utilisé, mot de passe trop faible, etc.)
  if (error) {
    console.log(error)
    return redirect('/login?message=Erreur lors de la création du compte')
  }

  const user = await supabase
    .from('invitations')
    .insert({
      project_id: projectId,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();

  const project = await supabase
    .from('invitations')
    .insert({
      project_id: projectId,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();


  revalidatePath('/', 'layout')
  redirect('/')
}


export async function logout() {
  const supabase = await createClient()

  // On supprime la session côté Supabase et on efface les cookies
  await supabase.auth.signOut()

  // On redirige l'utilisateur vers la page d'accueil ou de login
  redirect('/')
}
