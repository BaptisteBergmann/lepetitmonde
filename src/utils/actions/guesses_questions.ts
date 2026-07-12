'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { createClient } from '@utils/supabase/server'
import { TablesInsert } from '@utils/supabase/database.types'
import { logger } from '../logger'

export async function getQuestions(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")
  const contextLogger = logger.child({
    module: 'guess-action',
    babyId,
    user: user.id
  });

  contextLogger.info({ babyId }, "babyId: ")

  const { data, error } = await supabase
    .from('guess_questions')
    .select("*")
    .eq('baby_id', babyId);

  if (error) { console.error(error); return [] }
  contextLogger.debug(data, "Received questions")
  return data
}



type NewGuess = TablesInsert<'guess_questions'>;

export async function addQuestion(formData: NewGuess) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  // 4. Insérer dans la base de données
  console.log("ADD question", formData)
  const rep = await supabase
    .from('guess_questions')
    .insert(formData)

  if (rep.error) { console.error(rep.error); return rep }
  console.log("ADDED question")
  return rep

}

export async function getQuestionsWithGuess(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")
  const contextLogger = logger.child({
    function: getQuestionsWithGuess.name,
    babyId,
    user: user.id
  });

  contextLogger.info({ babyId }, "babyId: ")

  const { data, error } = await supabase
    .from('guess_questions')
    .select("*, guesses!inner (*)")
    .eq('baby_id', babyId)
    .eq('guesses.user_id', user.id);;

  if (error) { console.error(error); return [] }
  contextLogger.debug(data, "Received questions with guess")
  return data
}

export async function getQuestionsWithoutGuess(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")
  const contextLogger = logger.child({
    function: getQuestionsWithoutGuess.name,
    babyId,
    user: user.id
  });

  contextLogger.info({ babyId }, "babyId: ")

  const { data, error } = await supabase
    .from('guess_questions')
    .select("*, guesses (*)")
    .eq('baby_id', babyId)
    .is('guesses.user_id', null);

  if (error) { console.error(error); return [] }
  contextLogger.debug(data, "Received questions with guess")
  return data
}


