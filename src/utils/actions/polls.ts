'use server'

import { createClient } from '@utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getNicknamesByBaby } from './users'
import { getDisplayName } from '../users'
import { logger } from '../logger'
import { actionError } from './errors'
import { FEED_LIMITS, normalizeText } from '@utils/feed-validation'
import { assertAdmin, assertMember, assertOptionInPoll, assertPollVisible, assertPostVisible, findVisiblePost } from '@utils/feed-access'

async function assertValidOptions(options: string[]) {
  if (!Array.isArray(options)) throw await actionError('pollOptionsCount')
  const normalized = await Promise.all(options.map((option) => normalizeText(option, FEED_LIMITS.pollOption)))
  const trimmed = normalized.filter((option): option is string => option !== null)
  if (trimmed.length < 2 || trimmed.length > 6) {
    throw await actionError('pollOptionsCount')
  }
  return trimmed
}

export async function createPoll(postId: string, babyId: string, question: string, options: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createPoll.name, postId, babyId })

  await assertPostVisible(postId, babyId, await assertAdmin(babyId))

  const trimmedQuestion = await normalizeText(question, FEED_LIMITS.pollQuestion, { requiredKey: 'pollQuestionRequired' })
  const trimmedOptions = await assertValidOptions(options)

  const { data: poll, error } = await supabase
    .from('polls')
    .insert([{ post_id: postId, question: trimmedQuestion }])
    .select('id')
    .single()

  if (error) {
    // polls has UNIQUE(post_id). If the first call landed but its response
    // was lost, the modal's retry hits that constraint: rewrite the existing
    // poll with what the user just submitted instead of failing for good.
    // updatePoll repeats the admin and visibility checks and still refuses
    // a poll that already has votes.
    if (error.code === '23505') {
      const { data: existing, error: existingError } = await supabase
        .from('polls')
        .select('id')
        .eq('post_id', postId)
        .maybeSingle()

      if (existingError) contextLogger.error(existingError, "Error checking existing poll on retry")

      if (existing) {
        contextLogger.info({ pollId: existing.id }, "Poll already existed (retry)")
        return updatePoll(existing.id, postId, babyId, question, options)
      }
    }

    contextLogger.error(error, "Error creating poll")
    throw error
  }

  const { error: optionsError } = await supabase
    .from('poll_options')
    .insert(trimmedOptions.map((label, position) => ({ poll_id: poll.id, label, position })))

  if (optionsError) {
    contextLogger.error(optionsError, "Error creating poll options")
    // Undo the option-less poll before failing so the modal's retry starts
    // from a clean insert.
    const { error: rollbackError } = await supabase
      .from('polls')
      .delete()
      .eq('id', poll.id)
      .eq('post_id', postId)
    if (rollbackError) contextLogger.error(rollbackError, "Error rolling back option-less poll")
    throw optionsError
  }

  contextLogger.info({ pollId: poll.id }, "Poll created")

  revalidatePath(`/baby/${babyId}/feed`)
}

export async function updatePoll(pollId: string, postId: string, babyId: string, question: string, options: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updatePoll.name, pollId, postId, babyId })

  // Must run before the vote count and the options delete below, which are
  // scoped by pollId alone.
  const { poll } = await assertPollVisible(pollId, babyId, await assertAdmin(babyId))
  if (poll.post_id !== postId) throw await actionError('unauthorized')

  const { count: voteCount, error: voteCountError } = await supabase
    .from('poll_votes')
    .select('id', { count: 'exact', head: true })
    .eq('poll_id', pollId)

  if (voteCountError) { contextLogger.error(voteCountError, "Error checking poll votes"); throw voteCountError }
  if (voteCount && voteCount > 0) throw await actionError('cannotEditVotedPoll')

  const trimmedQuestion = await normalizeText(question, FEED_LIMITS.pollQuestion, { requiredKey: 'pollQuestionRequired' })
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

  const { poll } = await assertPollVisible(pollId, babyId, await assertAdmin(babyId))
  if (poll.post_id !== postId) throw await actionError('unauthorized')

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

  const { viewer } = await assertPollVisible(pollId, babyId, await assertMember(babyId))
  // Without this, an option from another poll could be paired with this
  // poll id to inflate that other poll's count.
  await assertOptionInPoll(optionId, pollId)
  const user = { id: viewer.userId }

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

  const found = await findVisiblePost(postId, babyId)
  if (!found) return null
  const user = { id: found.viewer.userId }

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
