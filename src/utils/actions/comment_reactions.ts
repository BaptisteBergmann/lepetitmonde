'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getDisplayName } from '@utils/users'
import { notifyUsers } from './notify'
import { getUserAccess } from './users'
import { logger } from '../logger'
import { actionError } from './errors'

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

  const { data: comment } = await supabase.from('post_comments').select('user_id, post_id').eq('id', commentId).single()
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
      url: `/baby/${babyId}/feed?postId=${comment.post_id}`,
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
