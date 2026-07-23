'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { revalidatePath } from 'next/cache'
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

export async function getReactions(postId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getReactions.name, postId })

  const { data: { user } } = await getAuthUser()

  const { data, error } = await supabase
    .from('post_reactions')
    .select('emoji, user_id')
    .eq('post_id', postId)

  if (error) { contextLogger.error(error, "Error fetching reactions"); return { counts: {}, myEmoji: null } }

  const counts: Record<string, number> = {}
  data.forEach(({ emoji }) => { counts[emoji] = (counts[emoji] ?? 0) + 1 })

  const myEmoji = (user && data.find((r) => r.user_id === user.id)?.emoji) ?? null

  return { counts, myEmoji }
}
