'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { logger } from '../logger'
import { TablesInsert } from '../supabase/database.types'
import { getUserAccess } from './users'
import { assertIsAdmin } from './access'
import { actionError } from './errors'

type InsertGuess = Pick<TablesInsert<"guesses">, "baby_id" | "question_id" | "answer">

export async function submitGuess(guess: InsertGuess) {
  const contextLogger = logger.child({ function: submitGuess.name })
  const supabase = await createClient()

  // 3. Récupérer l'utilisateur courant pour la sécurité
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(guess.baby_id)
  if (Array.isArray(access)) throw await actionError('unauthorized')

  if (!guess.question_id) throw await actionError('pronosticNotFound')

  // The question must belong to this baby and still be open: once resolved,
  // the answer is public on the leaderboard and late guesses could copy it.
  const { data: question, error: questionError } = await supabase
    .from('guess_questions')
    .select('status, resolved_at')
    .eq('id', guess.question_id)
    .eq('baby_id', guess.baby_id)
    .maybeSingle()

  if (questionError) { contextLogger.error(questionError, "Error fetching question before guess"); throw questionError }
  if (!question || question.status !== 'approved') throw await actionError('pronosticNotFound')
  if (question.resolved_at) throw await actionError('pronosticClosed')

  // Un pronostic est définitif : on vérifie qu'aucune réponse n'existe déjà
  // pour empêcher un utilisateur de changer son pronostic après coup.
  const { data: existing, error: existingError } = await supabase
    .from('guesses')
    .select('id')
    .eq('question_id', guess.question_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) throw await actionError('alreadyAnswered')

  contextLogger.debug(guess, "User sending guess")
  // 4. Insérer dans la base de données
  const { error } = await supabase
    .from('guesses')
    // Explicit fields only: the client must not be able to set is_correct /
    // is_funny on its own guess.
    .insert([{
      baby_id: guess.baby_id,
      question_id: guess.question_id,
      answer: guess.answer,
      user_id: user.id,
    }])

  if (error) throw error
}

export async function getAllGuesses(babyId: string) {
  const contextLogger = logger.child({ function: getAllGuesses.name, babyId })
  const supabase = await createClient()
  // Everyone's answers, including on open questions: admin-only, otherwise
  // any member could read the others' guesses before results are revealed.
  await assertIsAdmin(supabase, babyId)

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


function revalidateGuessPages(babyId: string) {
  revalidatePath(`/baby/${babyId}/guess`)
  revalidatePath(`/baby/${babyId}/guess/admin`)
  revalidatePath(`/baby/${babyId}/guess/leaderboard`)
}

// null = back to the automatic normalized match. Only free-text answers can
// be judged by hand: option/number/date/time are scored objectively.
export async function setGuessVerdict(babyId: string, guessId: string, isCorrect: boolean | null) {
  const contextLogger = logger.child({ function: setGuessVerdict.name, babyId, guessId })
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  // Only reachable with a hand-crafted call; the UI always sends a boolean or null.
  if (isCorrect !== null && typeof isCorrect !== 'boolean') throw await actionError('unauthorized')

  const { data: guess, error: guessError } = await supabase
    .from('guesses')
    .select('question_id')
    .eq('id', guessId)
    .eq('baby_id', babyId)
    .maybeSingle()

  if (guessError) { contextLogger.error(guessError, "Error fetching guess before verdict"); throw guessError }
  if (!guess) throw await actionError('pronosticNotFound')

  const { data: question, error: questionError } = await supabase
    .from('guess_questions')
    .select('type')
    .eq('id', guess.question_id)
    .eq('baby_id', babyId)
    .maybeSingle()

  if (questionError) { contextLogger.error(questionError, "Error fetching question before verdict"); throw questionError }
  if (!question) throw await actionError('pronosticNotFound')
  if (question.type !== 'text') throw await actionError('verdictTextOnly')

  const { error } = await supabase
    .from('guesses')
    .update({ is_correct: isCorrect })
    .eq('id', guessId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error setting guess verdict"); throw error }
  contextLogger.info({ isCorrect }, "Guess verdict set")

  revalidateGuessPages(babyId)
}

export async function setGuessFunny(babyId: string, guessId: string, isFunny: boolean) {
  const contextLogger = logger.child({ function: setGuessFunny.name, babyId, guessId })
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  // Only reachable with a hand-crafted call; the UI always sends a boolean.
  if (typeof isFunny !== 'boolean') throw await actionError('unauthorized')

  const { error } = await supabase
    .from('guesses')
    .update({ is_funny: isFunny })
    .eq('id', guessId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error setting guess funny flag"); throw error }
  contextLogger.info({ isFunny }, "Guess funny flag set")

  revalidateGuessPages(babyId)
}
