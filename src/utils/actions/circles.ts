'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { Tables, TablesInsert } from '@utils/supabase/database.types'

export async function addUserToCircle() {
  // 1. Initialiser le client Supabase côté serveur
  const supabase = await createClient()


  // 3. Récupérer l'utilisateur courant pour la sécurité
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  // 4. Insérer dans la base de données
  const { error } = await supabase
    .from('guesses')
    .insert([{
      user_id: user.id,
      weight_guess: weight,
      birth_date_guess: date
    }])

  if (error) throw error

  // 5. Rafraîchir la page pour que l'utilisateur voit son nouveau pronostic
  revalidatePath('/guesses')
}


type NewCircle = TablesInsert<'circles'>;

export async function createCircle(circle: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  console.log("circle", circle)
  const rep = await supabase
    .from('circles')
    .insert([{
      name: circle.get("name"),
      baby_id: circle.get("babyId"),
    }])

  if (rep.error) throw rep.error
}

type Circle = Tables<'circles'>;

export async function getCircles(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const rep = await supabase
    .from('circles')
    .select("*")
    .eq('baby_id', babyId);


  if (rep.error) throw rep.error
  return rep.data
}

export async function getCirclesAccess(babyId: string, userId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const rep = await supabase
    .from('circles_access')
    .select("*")
    .eq('baby_id', babyId)
    .eq('user_id', userId)
    ;


  if (rep.error) throw rep.error
  return rep.data
}


