'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { TablesInsert, Json } from '@utils/supabase/database.types'
import { getTranslations } from 'next-intl/server'
import { logger } from '../logger'
import { getUserAccess, getUsers } from './users'
import { assertIsAdmin, getAllBabyMemberIds } from './access'
import { notifyUsers } from './notify'
import { actionError } from './errors'
import { computeWinners } from '../guess_scoring'

export async function getQuestions(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

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
    .eq('status', 'approved')
    .order('position', { ascending: true });

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
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

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

  if (decision === 'approved') {
    const { data: { user } } = await supabase.auth.getUser()
    const recipients = await getAllBabyMemberIds(babyId, user?.id)
    const t = await getTranslations('pushNotifications')
    await notifyUsers(babyId, 'new_pronostic', {
      title: t('newPronostic.title'),
      body: t('newPronostic.body'),
      url: `/baby/${babyId}/guess`,
    }, recipients)
  }
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
    throw await actionError('cannotDeleteAnsweredPronostic')
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

export async function moveQuestion(babyId: string, questionId: string, direction: 'up' | 'down') {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: moveQuestion.name, babyId, questionId, direction })

  const { data: questions, error } = await supabase
    .from('guess_questions')
    .select('id, position')
    .eq('baby_id', babyId)
    .eq('status', 'approved')
    .order('position', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching questions before reorder"); throw error }

  const index = questions.findIndex((q) => q.id === questionId)
  if (index === -1) throw await actionError('pronosticNotFound')

  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= questions.length) return

  const current = questions[index]
  const swapWith = questions[swapIndex]

  const [{ error: error1 }, { error: error2 }] = await Promise.all([
    supabase.from('guess_questions').update({ position: swapWith.position }).eq('baby_id', babyId).eq('id', current.id),
    supabase.from('guess_questions').update({ position: current.position }).eq('baby_id', babyId).eq('id', swapWith.id),
  ])

  if (error1 || error2) { contextLogger.error(error1 || error2, "Error swapping positions"); throw error1 || error2 }
  contextLogger.info("Question moved")

  revalidatePath(`/baby/${babyId}/guess`)
  revalidatePath(`/baby/${babyId}/guess/admin`)
}

export async function resolveQuestion(babyId: string, questionId: string, correctAnswer: Json) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: resolveQuestion.name, babyId, questionId })

  const { data: question, error: fetchError } = await supabase
    .from('guess_questions')
    .select('status')
    .eq('baby_id', babyId)
    .eq('id', questionId)
    .single()

  if (fetchError) { contextLogger.error(fetchError, "Error fetching question before resolving"); throw fetchError }
  if (question.status !== 'approved') throw await actionError('pronosticNotApproved')

  const { error } = await supabase
    .from('guess_questions')
    .update({ correct_answer: correctAnswer, resolved_at: new Date().toISOString() })
    .eq('baby_id', babyId)
    .eq('id', questionId)

  if (error) { contextLogger.error(error, "Error resolving question"); throw error }
  contextLogger.info("Question resolved")

  revalidatePath(`/baby/${babyId}/guess`)
  revalidatePath(`/baby/${babyId}/guess/admin`)
  revalidatePath(`/baby/${babyId}/guess/leaderboard`)
}

export async function unresolveQuestion(babyId: string, questionId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: unresolveQuestion.name, babyId, questionId })

  const { error } = await supabase
    .from('guess_questions')
    .update({ correct_answer: null, resolved_at: null })
    .eq('baby_id', babyId)
    .eq('id', questionId)

  if (error) { contextLogger.error(error, "Error unresolving question"); throw error }
  contextLogger.info("Question unresolved")

  revalidatePath(`/baby/${babyId}/guess`)
  revalidatePath(`/baby/${babyId}/guess/admin`)
  revalidatePath(`/baby/${babyId}/guess/leaderboard`)
}

// Visible to any baby member, matching the existing baby-wide visibility of
// guesses themselves (see getAllGuesses / .claude/plans/rls.md).
export async function getLeaderboard(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

  const contextLogger = logger.child({ function: getLeaderboard.name, babyId })

  const { data: questions, error: questionsError } = await supabase
    .from('guess_questions')
    .select('id, type, correct_answer')
    .eq('baby_id', babyId)
    .eq('status', 'approved')
    .not('resolved_at', 'is', null)

  if (questionsError) { contextLogger.error(questionsError, "Error fetching resolved questions"); return [] }
  if (questions.length === 0) return []

  const { data: guesses, error: guessesError } = await supabase
    .from('guesses')
    .select('user_id, question_id, answer')
    .eq('baby_id', babyId)
    .in('question_id', questions.map((question) => question.id))

  if (guessesError) { contextLogger.error(guessesError, "Error fetching guesses for leaderboard"); return [] }

  const users = await getUsers(babyId)
  const nameById = new Map(
    users
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ') || null])
  )

  const scoreByUser = new Map<string, { points: number; questionsWon: number }>()

  for (const question of questions) {
    const questionGuesses = guesses.filter((guess) => guess.question_id === question.id)
    for (const winner of computeWinners(question, questionGuesses)) {
      const entry = scoreByUser.get(winner.userId) ?? { points: 0, questionsWon: 0 }
      entry.points += winner.points
      entry.questionsWon += 1
      scoreByUser.set(winner.userId, entry)
    }
  }

  return Array.from(scoreByUser.entries())
    .map(([userId, { points, questionsWon }]) => ({
      userId,
      name: nameById.get(userId) ?? null,
      points,
      questionsWon,
    }))
    .sort((a, b) => b.points - a.points)
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
    // Answers already exist: the question's structure (type/options) must stay
    // stable so existing answers remain interpretable, but the wording (title,
    // description) is safe to correct at any time.
    const { data: existing, error: fetchError } = await supabase
      .from('guess_questions')
      .select('type, options')
      .eq('id', questionId)
      .eq('baby_id', babyId)
      .single()

    if (fetchError) { contextLogger.error(fetchError, "Error fetching question before update"); throw fetchError }

    const structureChanged = existing.type !== formData.type
      || JSON.stringify(existing.options) !== JSON.stringify(formData.options ?? null)

    if (structureChanged) {
      throw await actionError('cannotEditAnsweredPronostic')
    }
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
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(formData.baby_id)
  if (Array.isArray(access)) {
    contextLogger.warn({ user: user.id }, "User without baby access attempted to create a question")
    throw await actionError('unauthorized')
  }

  const isAdmin = access.access_level === "admin"

  const { data: lastQuestion } = await supabase
    .from('guess_questions')
    .select('position')
    .eq('baby_id', formData.baby_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

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
      position: (lastQuestion?.position ?? 0) + 1,
    })

  if (rep.error) { contextLogger.error(rep.error, "Error inserting question"); return rep }
  contextLogger.info({ isAdmin }, isAdmin ? "Question created" : "Question proposed, pending review")

  if (isAdmin) {
    const recipients = await getAllBabyMemberIds(formData.baby_id, user.id)
    const t = await getTranslations('pushNotifications')
    await notifyUsers(formData.baby_id, 'new_pronostic', {
      title: t('newPronostic.title'),
      body: t('newPronostic.body'),
      url: `/baby/${formData.baby_id}/guess`,
    }, recipients)
  }

  return rep

}

export async function getQuestionsWithGuess(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

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
    .eq('guesses.user_id', user.id)
    .order('position', { ascending: true });

  if (error) { console.error(error); return [] }
  contextLogger.debug(data, "Received questions with guess")
  return data
}

export async function getQuestionsWithoutGuess(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

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
    .eq('status', 'approved')
    .order('position', { ascending: true });

  if (guessedQuestionIds.length > 0) {
    query = query.not('id', 'in', `(${guessedQuestionIds.join(',')})`);
  }

  const { data, error } = await query;


  if (error) { console.error(error); return [] }
  contextLogger.debug(data, "Received questions with guess")
  return data
}


