'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { getDisplayName } from '@utils/users'
import { getUserAccess, getNicknamesByBaby } from './users'
import { logger } from '../logger'

export type PostViewsData = {
  count: number
  names: string[]
}

export async function markPostViewed(postId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: markPostViewed.name, postId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) return

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) return

  const { error } = await supabase
    .from('post_views')
    .upsert([{ post_id: postId, user_id: user.id }], { onConflict: 'post_id,user_id', ignoreDuplicates: true })

  if (error) { contextLogger.error(error, "Error marking post viewed"); return }

  contextLogger.debug("Post marked viewed")
}

export async function getPostViews(postId: string, excludeUserId: string | null | undefined, babyId: string): Promise<PostViewsData> {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getPostViews.name, postId, babyId })

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('post_views')
      .select('user_id, users (first_name, last_name)')
      .eq('post_id', postId),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching post views"); return { count: 0, names: [] } }

  const others = data.filter((row) => row.user_id !== excludeUserId)
  const names = others.map(({ user_id, users: viewerOrList }) => {
    const viewer = Array.isArray(viewerOrList) ? viewerOrList[0] : viewerOrList
    return getDisplayName(viewer, nicknames[user_id]) || "Utilisateur"
  })

  return { count: others.length, names }
}
