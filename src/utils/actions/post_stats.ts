'use server'

import { createClient } from '@utils/supabase/server'
import { getReactions, ReactionsData } from './reactions'
import { getPostViews, PostViewsData } from './views'
import { getPollWithResults, PollWithResults } from './polls'
import { logger } from '../logger'

export type PostStats = {
  reactions: ReactionsData['breakdown']
  views: PostViewsData
  commentCount: number
  poll: PollWithResults | null
}

export async function getPostStats(postId: string, babyId: string, excludeUserId?: string | null): Promise<PostStats> {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getPostStats.name, postId, babyId })

  const [{ breakdown }, views, { count, error }, poll] = await Promise.all([
    getReactions(postId, babyId),
    getPostViews(postId, excludeUserId, babyId),
    supabase.from('post_comments').select('*', { count: 'exact', head: true }).eq('post_id', postId),
    getPollWithResults(postId, babyId),
  ])

  if (error) contextLogger.error(error, "Error counting comments")

  return { reactions: breakdown, views, commentCount: count ?? 0, poll }
}
