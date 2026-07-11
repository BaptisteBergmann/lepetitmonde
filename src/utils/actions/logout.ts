'use server'

import { createClient } from '@utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logger } from '../logger'


export async function signup(formData: FormData) {
  const supabase = await createClient()

  // On récupère les données du formulaire
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const token = formData.get('token') as string

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
    console.log(error)
    return redirect('/signup?message=Erreur lors de la création du compte')
  }

  const contextLogger = logger.child({
    module: 'signup',
    user: user.user.id
  });


  const invitation = await supabase
    .from('invitations')
    .select('*')
    .eq("id", token)
    .single();

  contextLogger.info(invitation, "Get invitation data")

  const addUser = await supabase
    .from("users")
    .insert({
      first_name: name.split(" ")[0],
      last_name: name.split(" ")[1],
      id: user.user?.id
    })

  contextLogger.info(addUser, "Add user")


  const access = await supabase
    .from('baby_access')
    .insert({
      user_id: user.user?.id,
      baby_id: invitation.data.baby_id,
    })

  contextLogger.info(access, "Add access")

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
