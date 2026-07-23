'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { revalidatePath } from 'next/cache'
import { REACTIONS } from '@utils/reactions'
import { getDisplayName } from '@utils/users'
import { notifyUsers } from './notify'
import { logger } from '../logger'

export async function addReaction(postId: string, babyId: string, emoji: string = '❤️') {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addReaction.name, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw new Error("Non autorisé")

  const { error } = await supabase
    .from('post_reactions')
    .upsert([{ post_id: postId, user_id: user.id, emoji }], { onConflict: 'post_id,user_id' })

  if (error) { contextLogger.error(error, "Error adding reaction"); throw error }

  contextLogger.info("Reaction added")

  revalidatePath(`/baby/${babyId}/feed`)

  const { data: post } = await supabase.from('posts').select('created_by').eq('id', postId).single()
  if (post?.created_by && post.created_by !== user.id) {
    const { data: reactor } = await supabase.from('users').select('first_name, last_name, nickname').eq('id', user.id).single()
    const name = getDisplayName(reactor) || 'Quelqu\'un'
    await notifyUsers(babyId, 'new_reaction', {
      title: 'Nouvelle réaction',
      body: `${name} a réagi ${emoji} à votre publication`,
      url: `/baby/${babyId}/feed`,
    }, [post.created_by])
  }
}

export async function removeReaction(postId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: removeReaction.name, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) throw new Error("Non autorisé")

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

export async function getReactions(postId: string): Promise<ReactionsData> {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getReactions.name, postId })

  const { data: { user } } = await getAuthUser()

  const { data, error } = await supabase
    .from('post_reactions')
    .select('emoji, user_id, users (*)')
    .eq('post_id', postId)

  if (error) { contextLogger.error(error, "Error fetching reactions"); return { breakdown: [], myEmoji: null } }

  const namesByEmoji = new Map<string, string[]>()
  data.forEach(({ emoji, users: reactorOrList }) => {
    const reactor = Array.isArray(reactorOrList) ? reactorOrList[0] : reactorOrList
    const name = getDisplayName(reactor) || "Utilisateur"
    namesByEmoji.set(emoji, [...(namesByEmoji.get(emoji) ?? []), name])
  })

  const breakdown = REACTIONS
    .map(({ emoji }) => ({ emoji, count: namesByEmoji.get(emoji)?.length ?? 0, names: namesByEmoji.get(emoji) ?? [] }))
    .filter((reaction) => reaction.count > 0)

  const myEmoji = (user && data.find((r) => r.user_id === user.id)?.emoji) ?? null

  return { breakdown, myEmoji }
}
