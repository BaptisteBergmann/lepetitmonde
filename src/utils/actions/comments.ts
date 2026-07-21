'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { revalidatePath } from 'next/cache'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { logger } from '../logger'

export async function addComment(postId: string, babyId: string, body: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addComment.name, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw new Error("Non autorisé")

  const circleIds = await getUserCircleIds(babyId, user.id)

  const { error } = await supabase
    .from('post_comments')
    .insert([{ post_id: postId, user_id: user.id, circle_ids: circleIds, body }])

  if (error) { contextLogger.error(error, "Error adding comment"); throw error }

  contextLogger.info("Comment added")

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
