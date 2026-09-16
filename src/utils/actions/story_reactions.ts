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
      url: `/baby/${babyId}/feed`,
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

// Batched form for attaching reactions to a whole list of stories at once
// (used by getActiveStories): does the nickname lookup once instead of once
// per story.
export async function getStoryReactionsForStories(storyIds: string[], babyId: string): Promise<Record<string, ReactionsData>> {
  const contextLogger = logger.child({ function: getStoryReactionsForStories.name, babyId, storyCount: storyIds.length })
  const byStory: Record<string, ReactionsData> = Object.fromEntries(storyIds.map((id) => [id, { breakdown: [], myEmoji: null }]))
  if (storyIds.length === 0) return byStory

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('story_reactions')
      .select('story_id, emoji, user_id, users (first_name, last_name)')
      .in('story_id', storyIds),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching story reactions"); return byStory }

  const tCommon = await getTranslations('common')
  const namesByStoryEmoji = new Map<string, Map<string, string[]>>()
  const myEmojiByStory = new Map<string, string>()
  data.forEach(({ story_id, emoji, user_id, users: reactorOrList }) => {
    const reactor = Array.isArray(reactorOrList) ? reactorOrList[0] : reactorOrList
    const name = getDisplayName(reactor, nicknames[user_id]) || tCommon('userFallback')
    const namesByEmoji = namesByStoryEmoji.get(story_id) ?? new Map<string, string[]>()
    namesByEmoji.set(emoji, [...(namesByEmoji.get(emoji) ?? []), name])
    namesByStoryEmoji.set(story_id, namesByEmoji)
    if (user && user_id === user.id) myEmojiByStory.set(story_id, emoji)
  })

  for (const storyId of storyIds) {
    const namesByEmoji = namesByStoryEmoji.get(storyId)
    const breakdown = REACTIONS
      .map(({ emoji }) => ({ emoji, count: namesByEmoji?.get(emoji)?.length ?? 0, names: namesByEmoji?.get(emoji) ?? [] }))
      .filter((reaction) => reaction.count > 0)
    byStory[storyId] = { breakdown, myEmoji: myEmojiByStory.get(storyId) ?? null }
  }

  return byStory
}
