'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { TablesInsert } from '@utils/supabase/database.types'
import { logger } from '../logger'
import { getUserAccess } from './users'
import { assertIsAdmin } from './access'

export async function getQuestions(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw new Error("Non autorisé")

  const contextLogger = logger.child({
    module: 'guess-action',
    babyId,
    user: user.id
  });

  contextLogger.info({ babyId }, "babyId: ")

  const { data, error } = await supabase
    .from('guess_questions')
    .select("*")
    .eq('baby_id', babyId)
    .eq('status', 'approved');

  if (error) { console.error(error); return [] }
  contextLogger.debug(data, "Received questions")
  return data
}

export async function getPendingQuestions(babyId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: getPendingQuestions.name, babyId })

  const { data, error } = await supabase
    .from('guess_questions')
    .select("*")
    .eq('baby_id', babyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) { contextLogger.error(error, "Error fetching pending questions"); return [] }
  contextLogger.debug(data, "Received pending questions")
  return data
}

export async function getMyProposals(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw new Error("Non autorisé")

  const contextLogger = logger.child({ function: getMyProposals.name, babyId, user: user.id })

  const { data, error } = await supabase
    .from('guess_questions')
    .select("*")
    .eq('baby_id', babyId)
    .eq('created_by', user.id)
    .neq('status', 'approved')
    .order('created_at', { ascending: false });

  if (error) { contextLogger.error(error, "Error fetching my proposals"); return [] }
  contextLogger.debug(data, "Received my proposals")
  return data
}

export async function reviewQuestion(babyId: string, questionId: string, decision: 'approved' | 'rejected') {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: reviewQuestion.name, babyId, questionId })

  const { error } = await supabase
    .from('guess_questions')
    .update({ status: decision })
    .eq('baby_id', babyId)
    .eq('id', questionId)

  if (error) { contextLogger.error(error, "Error reviewing question"); throw error }
  contextLogger.info({ decision }, "Question reviewed")

  revalidatePath(`/baby/${babyId}/guess`)
  revalidatePath(`/baby/${babyId}/guess/admin`)
}

export async function deleteQuestion(babyId: string, questionId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: deleteQuestion.name, babyId, questionId })

  const { count, error: countError } = await supabase
    .from('guesses')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId)

  if (countError) { contextLogger.error(countError, "Error checking guesses before deletion"); throw countError }
  if (count && count > 0) {
    throw new Error("Impossible de supprimer un pronostic ayant déjà des réponses")
  }

  const { error } = await supabase
    .from('guess_questions')
    .delete()
    .eq('id', questionId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting question"); throw error }
  contextLogger.info("Question deleted")

  revalidatePath(`/baby/${babyId}/guess`)
  revalidatePath(`/baby/${babyId}/guess/admin`)
}

type NewGuess = TablesInsert<'guess_questions'>;
type QuestionUpdate = Omit<NewGuess, 'baby_id'>;

export async function updateQuestion(babyId: string, questionId: string, formData: QuestionUpdate) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: updateQuestion.name, babyId, questionId })

  const { count, error: countError } = await supabase
    .from('guesses')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId)

  if (countError) { contextLogger.error(countError, "Error checking guesses before update"); throw countError }
  if (count && count > 0) {
    throw new Error("Impossible de modifier un pronostic ayant déjà des réponses")
  }

  const { error } = await supabase
    .from('guess_questions')
    .update({
      title: formData.title,
      description: formData.description,
      type: formData.type,
      options: formData.options,
      is_active: formData.is_active,
    })
    .eq('id', questionId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating question"); throw error }
  contextLogger.info("Question updated")

  revalidatePath(`/baby/${babyId}/guess`)
  revalidatePath(`/baby/${babyId}/guess/admin`)
}

export async function addQuestion(formData: NewGuess) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addQuestion.name, babyId: formData.baby_id })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(formData.baby_id)
  if (Array.isArray(access)) {
    contextLogger.warn({ user: user.id }, "User without baby access attempted to create a question")
    throw new Error("Non autorisé")
  }

  const isAdmin = access.access_level === "admin"

  const rep = await supabase
    .from('guess_questions')
    .insert({
      baby_id: formData.baby_id,
      title: formData.title,
      description: formData.description,
      type: formData.type,
      options: formData.options,
      is_active: formData.is_active,
      created_by: user.id,
      status: isAdmin ? 'approved' : 'pending',
    })

  if (rep.error) { contextLogger.error(rep.error, "Error inserting question"); return rep }
  contextLogger.info({ isAdmin }, isAdmin ? "Question created" : "Question proposed, pending review")
  return rep

}

export async function getQuestionsWithGuess(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw new Error("Non autorisé")

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
    .eq('status', 'approved')
    .eq('guesses.user_id', user.id);;

  if (error) { console.error(error); return [] }
  contextLogger.debug(data, "Received questions with guess")
  return data
}

export async function getQuestionsWithoutGuess(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw new Error("Non autorisé")

  const contextLogger = logger.child({
    function: getQuestionsWithoutGuess.name,
    babyId,
    user: user.id
  });

  contextLogger.info({ babyId }, "babyId: ")

  const guessedQuestionIds = (await getQuestionsWithGuess(babyId)).map((q) => q.id)


  let query = supabase
    .from('guess_questions')
    .select("*")
    .eq('baby_id', babyId)
    .eq('status', 'approved');

  if (guessedQuestionIds.length > 0) {
    query = query.not('id', 'in', `(${guessedQuestionIds.join(',')})`);
  }

  const { data, error } = await query;


  if (error) { console.error(error); return [] }
  contextLogger.debug(data, "Received questions with guess")
  return data
}


