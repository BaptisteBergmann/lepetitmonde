'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { revalidatePath } from 'next/cache'
import { createClient } from '../../supabase/server'
import { Tables, TablesInsert } from '../../supabase/database.types'

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
      project_id: circle.get("projectId"),
    }])

  if (rep.error) throw rep.error
}

type Circle = Tables<'circles'>;

export async function getCircles(projectId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const rep = await supabase
    .from('circles')
    .select("*")
    .eq('project_id', projectId);


  if (rep.error) throw rep.error
  return rep.data
}

