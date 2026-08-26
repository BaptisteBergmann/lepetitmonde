'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { REACTIONS } from '@utils/reactions'
import { getDisplayName } from '@utils/users'
import { notifyUsers } from './notify'
import { getUserAccess, getNicknamesByBaby } from './users'
import { logger } from '../logger'
import { actionError } from './errors'
import type { ReactionsData } from './reactions'

export async function addCommentReaction(commentId: string, babyId: string, emoji: string = '❤️') {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addCommentReaction.name, commentId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

  const { error } = await supabase
    .from('comment_reactions')
    .upsert([{ comment_id: commentId, user_id: user.id, emoji }], { onConflict: 'comment_id,user_id' })

  if (error) { contextLogger.error(error, "Error adding comment reaction"); throw error }

  contextLogger.info("Comment reaction added")

  revalidatePath(`/baby/${babyId}/feed`)

  const { data: comment } = await supabase.from('post_comments').select('user_id').eq('id', commentId).single()
  if (comment?.user_id && comment.user_id !== user.id) {
    const { data: reactor } = await supabase
      .from('baby_access')
      .select('nickname, users (first_name, last_name)')
      .eq('baby_id', babyId)
      .eq('user_id', user.id)
      .single()
    const reactorProfile = Array.isArray(reactor?.users) ? reactor.users[0] : reactor?.users
    const t = await getTranslations('pushNotifications')
    const name = getDisplayName(reactorProfile, reactor?.nickname) || t('someoneFallback')
    await notifyUsers(babyId, 'new_comment_reaction', {
      title: t('newCommentReaction.title'),
      body: t('newCommentReaction.body', { name, emoji }),
      url: `/baby/${babyId}/feed`,
    }, [comment.user_id])
  }
}

export async function removeCommentReaction(commentId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: removeCommentReaction.name, commentId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

  const { error } = await supabase
    .from('comment_reactions')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', user.id)

  if (error) { contextLogger.error(error, "Error removing comment reaction"); throw error }

  contextLogger.info("Comment reaction removed")

  revalidatePath(`/baby/${babyId}/feed`)
}

// Batched form for attaching reactions to a whole list of comments at once
// (used by getComments/getCommentsForPosts): does the nickname lookup once
// instead of once per comment.
export async function getCommentReactionsForComments(commentIds: string[], babyId: string): Promise<Record<string, ReactionsData>> {
  const contextLogger = logger.child({ function: getCommentReactionsForComments.name, babyId, commentCount: commentIds.length })
  const byComment: Record<string, ReactionsData> = Object.fromEntries(commentIds.map((id) => [id, { breakdown: [], myEmoji: null }]))
  if (commentIds.length === 0) return byComment

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('comment_reactions')
      .select('comment_id, emoji, user_id, users (first_name, last_name)')
      .in('comment_id', commentIds),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching comment reactions"); return byComment }

  const tCommon = await getTranslations('common')
  const namesByCommentEmoji = new Map<string, Map<string, string[]>>()
  const myEmojiByComment = new Map<string, string>()
  data.forEach(({ comment_id, emoji, user_id, users: reactorOrList }) => {
    const reactor = Array.isArray(reactorOrList) ? reactorOrList[0] : reactorOrList
    const name = getDisplayName(reactor, nicknames[user_id]) || tCommon('userFallback')
    const namesByEmoji = namesByCommentEmoji.get(comment_id) ?? new Map<string, string[]>()
    namesByEmoji.set(emoji, [...(namesByEmoji.get(emoji) ?? []), name])
    namesByCommentEmoji.set(comment_id, namesByEmoji)
    if (user && user_id === user.id) myEmojiByComment.set(comment_id, emoji)
  })

  for (const commentId of commentIds) {
    const namesByEmoji = namesByCommentEmoji.get(commentId)
    const breakdown = REACTIONS
      .map(({ emoji }) => ({ emoji, count: namesByEmoji?.get(emoji)?.length ?? 0, names: namesByEmoji?.get(emoji) ?? [] }))
      .filter((reaction) => reaction.count > 0)
    byComment[commentId] = { breakdown, myEmoji: myEmojiByComment.get(commentId) ?? null }
  }

  return byComment
}
