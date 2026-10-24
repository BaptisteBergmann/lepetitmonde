'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { Json, TablesInsert } from '@utils/supabase/database.types'
import { MAX_TEXT_ANSWER_LENGTH, toComparable } from '@utils/guess_scoring'
import { getTranslations } from 'next-intl/server'
import { logger } from '../logger'
import { getUserAccess } from './users'
import { assertIsAdmin, getAllBabyMemberIds } from './access'
import { notifyUsers } from './notify'
import { actionError } from './errors'
import { normalizeText } from '../feed-validation'
import { INPUT_LIMITS } from '../input-limits'
import { assertOneOf, normalizeInteger, normalizeNumber } from '../input-validation'

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

type NewGuess = TablesInsert<'guess_questions'>;
const QUESTION_TYPES = ['option', 'number', 'date', 'time', 'text'] as const

type QuestionInput = Pick<NewGuess, 'title' | 'description' | 'type' | 'options' | 'is_active'>

// Rebuilds the question fields from validated pieces instead of passing the
// client's object through. `options` is rebuilt per type, with the same keys
// and key order the editor (guess/_components/modal.tsx) sends, because
// updateQuestion compares it to the stored value with JSON.stringify.
async function pickQuestionFields(raw: QuestionInput) {
  if (typeof raw !== 'object' || raw === null) throw await actionError('invalidInput')

  const type = await assertOneOf(raw.type, QUESTION_TYPES)
  const title = await normalizeText(raw.title, INPUT_LIMITS.pronosticTitle, { requiredKey: 'textRequired' })
  const description = await normalizeText(raw.description, INPUT_LIMITS.pronosticDescription)
  if (typeof raw.is_active !== 'boolean') throw await actionError('invalidInput')

  const rawOptions = (raw.options ?? null) as Record<string, unknown> | null
  if (rawOptions !== null && (typeof rawOptions !== 'object' || Array.isArray(rawOptions))) {
    throw await actionError('invalidInput')
  }

  let options: Json | null = null
  if (type === 'option') {
    const rawChoices = rawOptions?.choices
    if (!Array.isArray(rawChoices)
      || rawChoices.length < INPUT_LIMITS.pronosticChoicesMin
      || rawChoices.length > INPUT_LIMITS.pronosticChoicesMax) {
      throw await actionError('invalidInput')
    }
    const choices: string[] = []
    for (const choice of rawChoices) {
      choices.push(await normalizeText(choice, INPUT_LIMITS.pronosticChoice, { requiredKey: 'textRequired' }))
    }
    if (new Set(choices).size !== choices.length) throw await actionError('invalidInput')
    options = { choices }
  } else if (type === 'number') {
    options = {
      min: await normalizeNumber(rawOptions?.min, { min: -1e12, max: 1e12, nullable: true }),
      max: await normalizeNumber(rawOptions?.max, { min: -1e12, max: 1e12, nullable: true }),
      precision: await normalizeInteger(rawOptions?.precision, { min: 0, max: 10 }),
    }
  } else if (type === 'date') {
    // <input type="month"> / type="date" values.
    const monthOrDate = async (value: unknown) => value === null || value === undefined
      ? null
      : await normalizeText(value, 10, { requiredKey: 'invalidInput' })
    options = {
      defaultMonth: await monthOrDate(rawOptions?.defaultMonth),
      highlightedDate: await monthOrDate(rawOptions?.highlightedDate),
    }
  }

  return { type, title, description, options, is_active: raw.is_active }
}

type QuestionUpdate = Omit<NewGuess, 'baby_id'>;

export async function updateQuestion(babyId: string, questionId: string, formData: QuestionUpdate) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: updateQuestion.name, babyId, questionId })

  const fields = await pickQuestionFields(formData)

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

    const structureChanged = existing.type !== fields.type
      || JSON.stringify(existing.options) !== JSON.stringify(fields.options)

    if (structureChanged) {
      throw await actionError('cannotEditAnsweredPronostic')
    }
  }

  const { error } = await supabase
    .from('guess_questions')
    .update(fields)
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

  // A member's proposal is always created active (what the proposal form sends);
  // only admins can create an inactive question.
  const fields = await pickQuestionFields({ ...formData, is_active: isAdmin ? formData.is_active : true })

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
      ...fields,
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
    // Explicit guess columns: is_correct / is_funny are admin-side verdicts
    // and must not reach the member's browser.
    .select("*, guesses!inner (id, user_id, question_id, baby_id, answer, created_at)")
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
    // Closed questions can't be answered anymore (see submitGuess).
    .is('resolved_at', null)
    .order('position', { ascending: true });

  if (guessedQuestionIds.length > 0) {
    query = query.not('id', 'in', `(${guessedQuestionIds.join(',')})`);
  }

  const { data, error } = await query;


  if (error) { console.error(error); return [] }
  contextLogger.debug(data, "Received questions with guess")
  return data
}




function revalidateGuessPages(babyId: string) {
  revalidatePath(`/baby/${babyId}/guess`)
  revalidatePath(`/baby/${babyId}/guess/admin`)
  revalidatePath(`/baby/${babyId}/guess/leaderboard`)
}

// Returns the value to store, in the same JSON shape as guesses.answer for
// that type, or null when it isn't a valid answer for the question.
function normalizeCorrectAnswer(type: string, options: Json | null, value: unknown): Json | null {
  switch (type) {
    case 'option': {
      const choices = (options as { choices?: unknown } | null)?.choices
      if (typeof value !== 'string' || !Array.isArray(choices) || !choices.includes(value)) return null
      return value
    }
    case 'number': {
      if (typeof value !== 'string' && typeof value !== 'number') return null
      if (typeof value === 'string' && value.trim() === '') return null
      const n = Number(value)
      return Number.isFinite(n) ? n : null
    }
    case 'date': {
      if (typeof value !== 'string') return null
      const d = new Date(value)
      return Number.isFinite(d.getTime()) ? d.toISOString() : null
    }
    case 'time': {
      if (typeof value !== 'string' || toComparable('time', value) === null) return null
      return value.trim()
    }
    case 'text': {
      if (typeof value !== 'string') return null
      const trimmed = value.trim()
      if (trimmed === '' || trimmed.length > MAX_TEXT_ANSWER_LENGTH) return null
      return trimmed
    }
    default:
      return null
  }
}

// Also used to change the answer of an already-resolved question (owner
// decision): the original resolved_at is kept, so fixing a typo never
// re-opens the question to late guessers.
export async function resolveQuestion(babyId: string, questionId: string, correctAnswer: unknown) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: resolveQuestion.name, babyId, questionId })

  const { data: question, error: fetchError } = await supabase
    .from('guess_questions')
    .select('type, options, resolved_at')
    .eq('baby_id', babyId)
    .eq('id', questionId)
    .eq('status', 'approved')
    .maybeSingle()

  if (fetchError) { contextLogger.error(fetchError, "Error fetching question before resolve"); throw fetchError }
  if (!question) throw await actionError('pronosticNotFound')

  const normalized = normalizeCorrectAnswer(question.type, question.options, correctAnswer)
  if (normalized === null) throw await actionError('invalidCorrectAnswer')

  const { error } = await supabase
    .from('guess_questions')
    .update({
      correct_answer: normalized,
      resolved_at: question.resolved_at ?? new Date().toISOString(),
    })
    .eq('baby_id', babyId)
    .eq('id', questionId)
    .eq('status', 'approved')

  if (error) { contextLogger.error(error, "Error resolving question"); throw error }
  contextLogger.info({ wasResolved: !!question.resolved_at }, "Question resolved")

  revalidateGuessPages(babyId)
}

export async function unresolveQuestion(babyId: string, questionId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: unresolveQuestion.name, babyId, questionId })

  const { data, error } = await supabase
    .from('guess_questions')
    .update({ correct_answer: null, resolved_at: null })
    .eq('baby_id', babyId)
    .eq('id', questionId)
    .eq('status', 'approved')
    .select('id')

  if (error) { contextLogger.error(error, "Error re-opening question"); throw error }
  if (data.length === 0) throw await actionError('pronosticNotFound')
  contextLogger.info("Question re-opened")

  revalidateGuessPages(babyId)
}
