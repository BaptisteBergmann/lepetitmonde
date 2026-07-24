'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { revalidatePath } from 'next/cache'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { getBabyAdminIds } from './access'
import { notifyUsers } from './notify'
import { getDisplayName } from '@utils/users'
import { logger } from '../logger'

export async function addComment(postId: string, babyId: string, body: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addComment.name, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw new Error("Non autorisé")

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
  const name = getDisplayName(commenterProfile, commenter?.nickname) || 'Quelqu\'un'
  await notifyUsers(babyId, 'new_comment', {
    title: 'Nouveau commentaire',
    body: `${name} : ${body}`,
    url: `/baby/${babyId}/feed`,
  }, recipients)
}

export async function updateComment(commentId: string, postId: string, babyId: string, body: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateComment.name, commentId, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw new Error("Non autorisé")

  const { data, error } = await supabase
    .from('post_comments')
    .update({ body })
    .eq('id', commentId)
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .select('id')

  if (error) { contextLogger.error(error, "Error updating comment"); throw error }
  if (data.length === 0) { contextLogger.warn("Non-owner attempted to update comment"); throw new Error("Non autorisé") }

  contextLogger.info("Comment updated")

  revalidatePath(`/baby/${babyId}/feed`)
}

export async function deleteComment(commentId: string, postId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deleteComment.name, commentId, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'

  let query = supabase.from('post_comments').delete().eq('id', commentId).eq('post_id', postId)
  if (!isAdmin) query = query.eq('user_id', user.id)

  const { data, error } = await query.select('id')

  if (error) { contextLogger.error(error, "Error deleting comment"); throw error }
  if (data.length === 0) { contextLogger.warn("Unauthorized attempt to delete comment"); throw new Error("Non autorisé") }

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

  const { data, error } = await supabase
    .from('post_comments')
    .select('*, users (*)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching comments"); return [] }

  const visible = data.filter(
    (comment) => isAdmin || comment.user_id === user.id || comment.circle_ids.some((id: string) => userCircleIds.has(id))
  )

  contextLogger.debug({ count: visible.length }, "Comments received")

  return visible
}
