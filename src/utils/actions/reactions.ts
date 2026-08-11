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

export async function addReaction(postId: string, babyId: string, emoji: string = '❤️') {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addReaction.name, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

  const { error } = await supabase
    .from('post_reactions')
    .upsert([{ post_id: postId, user_id: user.id, emoji }], { onConflict: 'post_id,user_id' })

  if (error) { contextLogger.error(error, "Error adding reaction"); throw error }

  contextLogger.info("Reaction added")

  revalidatePath(`/baby/${babyId}/feed`)

  const { data: post } = await supabase.from('posts').select('created_by').eq('id', postId).single()
  if (post?.created_by && post.created_by !== user.id) {
    const { data: reactor } = await supabase
      .from('baby_access')
      .select('nickname, users (first_name, last_name)')
      .eq('baby_id', babyId)
      .eq('user_id', user.id)
      .single()
    const reactorProfile = Array.isArray(reactor?.users) ? reactor.users[0] : reactor?.users
    const t = await getTranslations('pushNotifications')
    const name = getDisplayName(reactorProfile, reactor?.nickname) || t('someoneFallback')
    await notifyUsers(babyId, 'new_reaction', {
      title: t('newReaction.title'),
      body: t('newReaction.body', { name, emoji }),
      url: `/baby/${babyId}/feed`,
    }, [post.created_by])
  }
}

export async function removeReaction(postId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: removeReaction.name, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

  const { error } = await supabase
    .from('post_reactions')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', user.id)

  if (error) { contextLogger.error(error, "Error removing reaction"); throw error }

  contextLogger.info("Reaction removed")

  revalidatePath(`/baby/${babyId}/feed`)
}

export type ReactionsData = {
  breakdown: { emoji: string; count: number; names: string[] }[]
  myEmoji: string | null
}

export async function getReactions(postId: string, babyId: string): Promise<ReactionsData> {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getReactions.name, postId, babyId })

  const { data: { user } } = await getAuthUser()

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('post_reactions')
      .select('emoji, user_id, users (first_name, last_name)')
      .eq('post_id', postId),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching reactions"); return { breakdown: [], myEmoji: null } }

  const tCommon = await getTranslations('common')
  const namesByEmoji = new Map<string, string[]>()
  data.forEach(({ emoji, user_id, users: reactorOrList }) => {
    const reactor = Array.isArray(reactorOrList) ? reactorOrList[0] : reactorOrList
    const name = getDisplayName(reactor, nicknames[user_id]) || tCommon('userFallback')
    namesByEmoji.set(emoji, [...(namesByEmoji.get(emoji) ?? []), name])
  })

  const breakdown = REACTIONS
    .map(({ emoji }) => ({ emoji, count: namesByEmoji.get(emoji)?.length ?? 0, names: namesByEmoji.get(emoji) ?? [] }))
    .filter((reaction) => reaction.count > 0)

  const myEmoji = (user && data.find((r) => r.user_id === user.id)?.emoji) ?? null

  return { breakdown, myEmoji }
}

// Batched form of getReactions for rendering a whole feed page at once: does
// the auth/nickname lookups once instead of once per post.
export async function getReactionsForPosts(postIds: string[], babyId: string): Promise<Record<string, ReactionsData>> {
  const contextLogger = logger.child({ function: getReactionsForPosts.name, babyId, postCount: postIds.length })
  const byPost: Record<string, ReactionsData> = Object.fromEntries(postIds.map((id) => [id, { breakdown: [], myEmoji: null }]))
  if (postIds.length === 0) return byPost

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('post_reactions')
      .select('post_id, emoji, user_id, users (first_name, last_name)')
      .in('post_id', postIds),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching reactions for posts"); return byPost }

  const tCommon = await getTranslations('common')
  const namesByPostEmoji = new Map<string, Map<string, string[]>>()
  const myEmojiByPost = new Map<string, string>()
  data.forEach(({ post_id, emoji, user_id, users: reactorOrList }) => {
    const reactor = Array.isArray(reactorOrList) ? reactorOrList[0] : reactorOrList
    const name = getDisplayName(reactor, nicknames[user_id]) || tCommon('userFallback')
    const namesByEmoji = namesByPostEmoji.get(post_id) ?? new Map<string, string[]>()
    namesByEmoji.set(emoji, [...(namesByEmoji.get(emoji) ?? []), name])
    namesByPostEmoji.set(post_id, namesByEmoji)
    if (user && user_id === user.id) myEmojiByPost.set(post_id, emoji)
  })

  for (const postId of postIds) {
    const namesByEmoji = namesByPostEmoji.get(postId)
    const breakdown = REACTIONS
      .map(({ emoji }) => ({ emoji, count: namesByEmoji?.get(emoji)?.length ?? 0, names: namesByEmoji?.get(emoji) ?? [] }))
      .filter((reaction) => reaction.count > 0)
    byPost[postId] = { breakdown, myEmoji: myEmojiByPost.get(postId) ?? null }
  }

  return byPost
}
