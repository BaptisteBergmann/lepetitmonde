'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getUserCircleIds } from './circles'
import { getUserAccess, getNicknamesByBaby } from './users'
import { getBabyAdminIds } from './access'
import { getCommentReactionsForComments } from './comment_reactions'
import { notifyUsers } from './notify'
import { getDisplayName } from '@utils/users'
import { logger } from '../logger'
import { actionError } from './errors'

export async function addComment(postId: string, babyId: string, body: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addComment.name, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

  const circleIds = await getUserCircleIds(babyId, user.id)

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
    body: t('newComment.body', { name, body }),
    url: `/baby/${babyId}/feed?postId=${postId}`,
  }, recipients)
}

export async function updateComment(commentId: string, postId: string, babyId: string, body: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateComment.name, commentId, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

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

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'

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

  const { data: { user } } = await getAuthUser()
  if (!user) return []

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  const userCircleIds = new Set(await getUserCircleIds(babyId, user.id))

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

// Batched form of getComments for rendering a whole feed page at once: does
// the auth/access/circle/nickname lookups once instead of once per post, so
// a feed of N posts costs one query fan-out instead of N.
export async function getCommentsForPosts(postIds: string[], babyId: string): Promise<Record<string, Comment[]>> {
  const contextLogger = logger.child({ function: getCommentsForPosts.name, babyId, postCount: postIds.length })
  const byPost: Record<string, Comment[]> = Object.fromEntries(postIds.map((id) => [id, []]))
  if (postIds.length === 0) return byPost

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()
  if (!user) return byPost

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  const userCircleIds = new Set(await getUserCircleIds(babyId, user.id))

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('post_comments')
      .select('*, users (*)')
      .in('post_id', postIds)
      .order('created_at', { ascending: true }),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching comments for posts"); return byPost }

  const visible = data.filter((comment) =>
    isAdmin || comment.user_id === user.id || comment.circle_ids.some((id: string) => userCircleIds.has(id))
  )
  const reactions = await getCommentReactionsForComments(visible.map((comment) => comment.id), babyId)

  for (const comment of visible) {
    byPost[comment.post_id]?.push({
      ...comment,
      nickname: nicknames[comment.user_id] ?? null,
      reactions: reactions[comment.id] ?? { breakdown: [], myEmoji: null },
    })
  }

  contextLogger.debug({ postCount: postIds.length }, "Comments for posts received")

  return byPost
}
