'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { revalidatePath } from 'next/cache'
import { createClient } from '../../supabase/server'

export async function submitGuess(formData: FormData) {
  // 1. Initialiser le client Supabase côté serveur
  const supabase = await createClient()

  // 2. Extraire les données du formulaire
  const weight = formData.get('weight')
  const date = formData.get('birthDate')

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
