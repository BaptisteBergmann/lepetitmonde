'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { getDisplayName } from '@utils/users'
import { getTranslations } from 'next-intl/server'
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

  const tCommon = await getTranslations('common')
  const others = data.filter((row) => row.user_id !== excludeUserId)
  const names = others.map(({ user_id, users: viewerOrList }) => {
    const viewer = Array.isArray(viewerOrList) ? viewerOrList[0] : viewerOrList
    return getDisplayName(viewer, nicknames[user_id]) || tCommon('userFallback')
  })

  return { count: others.length, names }
}

// Batched form of getPostViews for rendering a whole feed page at once: does
// the access/nickname lookups once instead of once per post. The "seen by"
// report is admin-only (same rule as getPostViews), so non-admins get an
// empty result without hitting the DB.
export async function getPostViewsForPosts(
  posts: { id: string; created_by: string | null }[],
  babyId: string
): Promise<Record<string, PostViewsData>> {
  const contextLogger = logger.child({ function: getPostViewsForPosts.name, babyId, postCount: posts.length })
  const byPost: Record<string, PostViewsData> = Object.fromEntries(posts.map((p) => [p.id, { count: 0, names: [] }]))
  if (posts.length === 0) return byPost

  const supabase = await createClient()
  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  if (!isAdmin) return byPost

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('post_views')
      .select('post_id, user_id, users (first_name, last_name)')
      .in('post_id', posts.map((p) => p.id)),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching post views for posts"); return byPost }

  const tCommon = await getTranslations('common')
  const excludeByPost = new Map(posts.map((p) => [p.id, p.created_by]))
  for (const row of data) {
    if (row.user_id === excludeByPost.get(row.post_id)) continue
    const viewer = Array.isArray(row.users) ? row.users[0] : row.users
    const name = getDisplayName(viewer, nicknames[row.user_id]) || tCommon('userFallback')
    const entry = byPost[row.post_id]
    entry.count += 1
    entry.names.push(name)
  }

  return byPost
}
