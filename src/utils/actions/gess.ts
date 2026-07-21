'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { createClient } from '@utils/supabase/server'
import { logger } from '../logger'
import { TablesInsert } from '../supabase/database.types'
import { getUserAccess } from './users'

type InsertGuess = TablesInsert<"guesses">

export async function submitGuess(guess: InsertGuess) {
  const contextLogger = logger.child({ function: submitGuess.name })
  const supabase = await createClient()

  // 3. Récupérer l'utilisateur courant pour la sécurité
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(guess.baby_id)
  if (Array.isArray(access)) throw new Error("Non autorisé")

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

