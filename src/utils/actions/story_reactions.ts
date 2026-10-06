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

export async function addStoryReaction(storyId: string, babyId: string, emoji: string = '❤️') {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addStoryReaction.name, storyId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

  const { error } = await supabase
    .from('story_reactions')
    .upsert([{ story_id: storyId, user_id: user.id, emoji }], { onConflict: 'story_id,user_id' })

  if (error) { contextLogger.error(error, "Error adding story reaction"); throw error }

  contextLogger.info("Story reaction added")

  revalidatePath(`/baby/${babyId}/feed`)

  const { data: story } = await supabase.from('stories').select('created_by').eq('id', storyId).single()
  if (story?.created_by && story.created_by !== user.id) {
    const { data: reactor } = await supabase
      .from('baby_access')
      .select('nickname, users (first_name, last_name)')
      .eq('baby_id', babyId)
      .eq('user_id', user.id)
      .single()
    const reactorProfile = Array.isArray(reactor?.users) ? reactor.users[0] : reactor?.users
    const t = await getTranslations('pushNotifications')
    const name = getDisplayName(reactorProfile, reactor?.nickname) || t('someoneFallback')
    await notifyUsers(babyId, 'new_story_reaction', {
      title: t('newStoryReaction.title'),
      body: t('newStoryReaction.body', { name, emoji }),
      url: `/baby/${babyId}/feed?storyId=${storyId}`,
    }, [story.created_by])
  }
}

export async function removeStoryReaction(storyId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: removeStoryReaction.name, storyId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

  const { error } = await supabase
    .from('story_reactions')
    .delete()
    .eq('story_id', storyId)
    .eq('user_id', user.id)

  if (error) { contextLogger.error(error, "Error removing story reaction"); throw error }

  contextLogger.info("Story reaction removed")

  revalidatePath(`/baby/${babyId}/feed`)
}
