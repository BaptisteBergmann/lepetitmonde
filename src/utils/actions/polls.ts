'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { assertIsAdmin } from './access'
import { getUserAccess, getNicknamesByBaby } from './users'
import { getDisplayName } from '../users'
import { logger } from '../logger'
import { actionError } from './errors'

async function assertValidOptions(options: string[]) {
  const trimmed = options.map((option) => option.trim()).filter(Boolean)
  if (trimmed.length < 2 || trimmed.length > 6) {
    throw await actionError('pollOptionsCount')
  }
  return trimmed
}

export async function createPoll(postId: string, babyId: string, question: string, options: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createPoll.name, postId, babyId })

  await assertIsAdmin(supabase, babyId)

  const trimmedQuestion = question.trim()
  if (!trimmedQuestion) throw await actionError('pollQuestionRequired')
  const trimmedOptions = await assertValidOptions(options)

  const { data: poll, error } = await supabase
    .from('polls')
    .insert([{ post_id: postId, question: trimmedQuestion }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating poll"); throw error }

  const { error: optionsError } = await supabase
    .from('poll_options')
    .insert(trimmedOptions.map((label, position) => ({ poll_id: poll.id, label, position })))

  if (optionsError) { contextLogger.error(optionsError, "Error creating poll options"); throw optionsError }

  contextLogger.info({ pollId: poll.id }, "Poll created")

  revalidatePath(`/baby/${babyId}/feed`)
}

export async function updatePoll(pollId: string, postId: string, babyId: string, question: string, options: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updatePoll.name, pollId, postId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { count: voteCount, error: voteCountError } = await supabase
    .from('poll_votes')
    .select('id', { count: 'exact', head: true })
    .eq('poll_id', pollId)

  if (voteCountError) { contextLogger.error(voteCountError, "Error checking poll votes"); throw voteCountError }
  if (voteCount && voteCount > 0) throw await actionError('cannotEditVotedPoll')

  const trimmedQuestion = question.trim()
  if (!trimmedQuestion) throw await actionError('pollQuestionRequired')
  const trimmedOptions = await assertValidOptions(options)

  const { error } = await supabase
    .from('polls')
    .update({ question: trimmedQuestion })
    .eq('id', pollId)
    .eq('post_id', postId)

  if (error) { contextLogger.error(error, "Error updating poll"); throw error }

  const { error: deleteOptionsError } = await supabase.from('poll_options').delete().eq('poll_id', pollId)
  if (deleteOptionsError) { contextLogger.error(deleteOptionsError, "Error clearing poll options"); throw deleteOptionsError }

  const { error: optionsError } = await supabase
    .from('poll_options')
    .insert(trimmedOptions.map((label, position) => ({ poll_id: pollId, label, position })))

  if (optionsError) { contextLogger.error(optionsError, "Error updating poll options"); throw optionsError }

  contextLogger.info("Poll updated")

  revalidatePath(`/baby/${babyId}/feed`)
}

export async function deletePoll(pollId: string, postId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deletePoll.name, pollId, postId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { error } = await supabase
    .from('polls')
    .delete()
    .eq('id', pollId)
    .eq('post_id', postId)

  if (error) { contextLogger.error(error, "Error deleting poll"); throw error }

  contextLogger.info("Poll deleted")

  revalidatePath(`/baby/${babyId}/feed`)
}

export async function votePoll(pollId: string, babyId: string, optionId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: votePoll.name, pollId, babyId, optionId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

  const { error } = await supabase
    .from('poll_votes')
    .upsert([{ poll_id: pollId, option_id: optionId, user_id: user.id }], { onConflict: 'poll_id,user_id' })

  if (error) { contextLogger.error(error, "Error voting on poll"); throw error }

  contextLogger.info("Vote registered")

  revalidatePath(`/baby/${babyId}/feed`)
}

export type PollWithResults = {
  id: string
  question: string
  totalVotes: number
  myOptionId: string | null
  options: { id: string; label: string; count: number; voterNames: string[] }[]
}

export async function getPollWithResults(postId: string, babyId: string): Promise<PollWithResults | null> {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getPollWithResults.name, postId, babyId })

  const { data: { user } } = await getAuthUser()

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('polls')
      .select('id, question, poll_options (id, label, position, poll_votes (user_id, users (first_name, last_name)))')
      .eq('post_id', postId)
      .maybeSingle(),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching poll"); return null }
  if (!data) return null

  const tCommon = await getTranslations('common')
  const sortedOptions = [...data.poll_options].sort((a, b) => a.position - b.position)

  let myOptionId: string | null = null
  const options = sortedOptions.map((option) => {
    if (user && option.poll_votes.some((vote) => vote.user_id === user.id)) myOptionId = option.id
    const voterNames = option.poll_votes.map(({ user_id, users: voterOrList }) => {
      const voter = Array.isArray(voterOrList) ? voterOrList[0] : voterOrList
      return getDisplayName(voter, nicknames[user_id]) || tCommon('userFallback')
    })
    return { id: option.id, label: option.label, count: option.poll_votes.length, voterNames }
  })

  const totalVotes = options.reduce((sum, option) => sum + option.count, 0)

  return { id: data.id, question: data.question, totalVotes, myOptionId, options }
}

// Batched form of getPollWithResults for rendering a whole feed page at
// once: does the auth/nickname lookups once instead of once per post.
export async function getPollsForPosts(postIds: string[], babyId: string): Promise<Record<string, PollWithResults | null>> {
  const contextLogger = logger.child({ function: getPollsForPosts.name, babyId, postCount: postIds.length })
  const byPost: Record<string, PollWithResults | null> = Object.fromEntries(postIds.map((id) => [id, null]))
  if (postIds.length === 0) return byPost

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('polls')
      .select('id, post_id, question, poll_options (id, label, position, poll_votes (user_id, users (first_name, last_name)))')
      .in('post_id', postIds),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching polls for posts"); return byPost }

  const tCommon = await getTranslations('common')
  for (const poll of data) {
    const sortedOptions = [...poll.poll_options].sort((a, b) => a.position - b.position)

    let myOptionId: string | null = null
    const options = sortedOptions.map((option) => {
      if (user && option.poll_votes.some((vote) => vote.user_id === user.id)) myOptionId = option.id
      const voterNames = option.poll_votes.map(({ user_id, users: voterOrList }) => {
        const voter = Array.isArray(voterOrList) ? voterOrList[0] : voterOrList
        return getDisplayName(voter, nicknames[user_id]) || tCommon('userFallback')
      })
      return { id: option.id, label: option.label, count: option.poll_votes.length, voterNames }
    })

    const totalVotes = options.reduce((sum, option) => sum + option.count, 0)

    byPost[poll.post_id] = { id: poll.id, question: poll.question, totalVotes, myOptionId, options }
  }

  return byPost
}
