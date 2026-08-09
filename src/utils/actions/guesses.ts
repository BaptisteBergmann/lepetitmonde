'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { logger } from '../logger'
import { TablesInsert } from '../supabase/database.types'
import { getUserAccess } from './users'
import { assertIsAdmin } from './access'

type InsertGuess = TablesInsert<"guesses">

export async function submitGuess(guess: InsertGuess) {
  const contextLogger = logger.child({ function: submitGuess.name })
  const supabase = await createClient()

  // 3. Récupérer l'utilisateur courant pour la sécurité
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(guess.baby_id)
  if (Array.isArray(access)) throw new Error("Non autorisé")

  // Un pronostic est définitif : on vérifie qu'aucune réponse n'existe déjà
  // pour empêcher un utilisateur de changer son pronostic après coup.
  const { data: existing, error: existingError } = await supabase
    .from('guesses')
    .select('id')
    .eq('question_id', guess.question_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) throw new Error("Vous avez déjà répondu à cette question")

  contextLogger.debug(guess, "User sending guess")
  // 4. Insérer dans la base de données
  const { error } = await supabase
    .from('guesses')
    .insert([{
      ...guess,
      user_id: user.id,
    }])

  if (error) throw error
}

export async function getGuesses() {
  const contextLogger = logger.child({ function: getGuesses.name })
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  contextLogger.debug(user, "Get user")

  const rep = await supabase
    .from('guesses')
    .select("*")
    .eq("user_id", user.id)

  if (rep.error) throw rep.error

  contextLogger.debug(rep, "User guesses")

  return rep.data
}

export async function getAllGuesses(babyId: string) {
  const contextLogger = logger.child({ function: getAllGuesses.name, babyId })
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw new Error("Non autorisé")

  const { data, error } = await supabase
    .from('guesses')
    .select("*")
    .eq("baby_id", babyId);

  if (error) {
    contextLogger.error(error, "Error fetching all guesses")
    return []
  }
  return data
}

export async function deleteGuess(babyId: string, guessId: string) {
  const contextLogger = logger.child({ function: deleteGuess.name, babyId, guessId })
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const { error } = await supabase
    .from('guesses')
    .delete()
    .eq('id', guessId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting guess"); throw error }
  contextLogger.info("Guess deleted")

  revalidatePath(`/baby/${babyId}/guess`)
  revalidatePath(`/baby/${babyId}/guess/admin`)
}

