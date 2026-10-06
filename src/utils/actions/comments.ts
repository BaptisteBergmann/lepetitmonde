'use server'

import { createClient } from '@utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getNicknamesByBaby } from './users'
import { getBabyAdminIds } from './access'
import { getCommentReactionsForComments } from '@utils/feed-loaders'
import { notifyUsers } from './notify'
import { getDisplayName } from '@utils/users'
import { logger } from '../logger'
import { actionError } from './errors'
import { FEED_LIMITS, normalizeText, truncateForPush } from '@utils/feed-validation'
import { assertCommentVisible, assertMember, assertPostVisible, findVisiblePost } from '@utils/feed-access'

export async function addComment(postId: string, babyId: string, rawBody: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addComment.name, postId, babyId })

  const { viewer } = await assertPostVisible(postId, babyId, await assertMember(babyId))
  const user = { id: viewer.userId }
  const circleIds = Array.from(viewer.circleIds)
  const body = await normalizeText(rawBody, FEED_LIMITS.comment, { requiredKey: 'commentRequired' })

  const { error } = await supabase
    .from('post_comments')
    .insert([{ post_id: postId, user_id: user.id, circle_ids: circleIds, body }])

  if (error) { contextLogger.error(error, "Error adding comment"); throw error }

  contextLogger.info("Comment added")

  revalidatePath(`/baby/${babyId}/feed`)

  const recipients = await getBabyAdminIds(babyId, user.id)
  const { data: commenter } = await supabase
    .from('baby_access')
    .select('nickname, users (first_name, last_name)')
    .eq('baby_id', babyId)
    .eq('user_id', user.id)
    .single()
  const commenterProfile = Array.isArray(commenter?.users) ? commenter.users[0] : commenter?.users
  const t = await getTranslations('pushNotifications')
  const name = getDisplayName(commenterProfile, commenter?.nickname) || t('someoneFallback')
  await notifyUsers(babyId, 'new_comment', {
    title: t('newComment.title'),
    body: t('newComment.body', { name, body: truncateForPush(body) }),
    url: `/baby/${babyId}/feed?postId=${postId}`,
  }, recipients)
}

export async function updateComment(commentId: string, postId: string, babyId: string, rawBody: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateComment.name, commentId, postId, babyId })

  const { viewer, comment } = await assertCommentVisible(commentId, babyId, await assertMember(babyId))
  if (comment.post_id !== postId) throw await actionError('unauthorized')
  const user = { id: viewer.userId }
  const body = await normalizeText(rawBody, FEED_LIMITS.comment, { requiredKey: 'commentRequired' })

  const { data, error } = await supabase
    .from('post_comments')
    .update({ body })
    .eq('id', commentId)
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .select('id')

  if (error) { contextLogger.error(error, "Error updating comment"); throw error }
  if (data.length === 0) { contextLogger.warn("Non-owner attempted to update comment"); throw await actionError('unauthorized') }

  contextLogger.info("Comment updated")

  revalidatePath(`/baby/${babyId}/feed`)
}

export async function deleteComment(commentId: string, postId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deleteComment.name, commentId, postId, babyId })

  // Admin rights only apply to comments on a post of *this* baby: the
  // ownership check below is what stops an admin of one baby deleting
  // comments in another.
  const { viewer, comment } = await assertCommentVisible(commentId, babyId, await assertMember(babyId))
  if (comment.post_id !== postId) throw await actionError('unauthorized')
  const user = { id: viewer.userId }
  const isAdmin = viewer.isAdmin

  let query = supabase.from('post_comments').delete().eq('id', commentId).eq('post_id', postId)
  if (!isAdmin) query = query.eq('user_id', user.id)

  const { data, error } = await query.select('id')

  if (error) { contextLogger.error(error, "Error deleting comment"); throw error }
  if (data.length === 0) { contextLogger.warn("Unauthorized attempt to delete comment"); throw await actionError('unauthorized') }

  contextLogger.info("Comment deleted")

  revalidatePath(`/baby/${babyId}/feed`)
}

export async function getComments(postId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getComments.name, postId, babyId })

  const found = await findVisiblePost(postId, babyId)
  if (!found) return []
  const { viewer } = found
  const user = { id: viewer.userId }
  const isAdmin = viewer.isAdmin
  const userCircleIds = viewer.circleIds

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('post_comments')
      .select('*, users (*)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true }),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching comments"); return [] }

  const visible = data
    .filter((comment) => isAdmin || comment.user_id === user.id || comment.circle_ids.some((id: string) => userCircleIds.has(id)))
    .map((comment) => ({ ...comment, nickname: nicknames[comment.user_id] ?? null }))

  const reactions = await getCommentReactionsForComments(visible.map((comment) => comment.id), babyId)
  const withReactions = visible.map((comment) => ({ ...comment, reactions: reactions[comment.id] ?? { breakdown: [], myEmoji: null } }))

  contextLogger.debug({ count: withReactions.length }, "Comments received")

  return withReactions
}

export type Comment = Awaited<ReturnType<typeof getComments>>[number]
