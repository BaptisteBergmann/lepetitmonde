// Batched interaction loaders for rendering a whole feed page at once.
//
// Deliberately NOT a 'use server' module: these do no per-id visibility
// check of their own (that would cost one extra query per loader per page),
// so they must never be callable as endpoints.
//
// Contract: callers pass ONLY ids they have already filtered by visibility
// for the current viewer and `babyId` (attachInteractionData in posts.ts,
// getComments, getActiveStories, getHighlights). getPostViewsForPosts keeps
// its own admin check because the "seen by" report is admin-only.
import 'server-only'
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { getTranslations } from 'next-intl/server'
import { REACTIONS } from '@utils/reactions'
import { getDisplayName } from '@utils/users'
import { getUserAccess, getNicknamesByBaby } from '@utils/actions/users'
import { getUserCircleIds } from '@utils/actions/circles'
import type { Comment } from '@utils/actions/comments'
import type { ReactionsData } from '@utils/actions/reactions'
import type { PollWithResults } from '@utils/actions/polls'
import type { PostViewsData } from '@utils/actions/views'
import { logger } from '@utils/logger'

export async function getViewedStoryIds(storyIds: string[], userId: string | undefined): Promise<Set<string>> {
  if (!userId || storyIds.length === 0) return new Set()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('story_views')
    .select('story_id')
    .eq('user_id', userId)
    .in('story_id', storyIds)

  if (error) return new Set()
  return new Set(data.map((row) => row.story_id))
}

// Batched form of getComments for rendering a whole feed page at once: does
// the auth/access/circle/nickname lookups once instead of once per post, so
// a feed of N posts costs one query fan-out instead of N.
export async function getCommentsForPosts(postIds: string[], babyId: string): Promise<Record<string, Comment[]>> {
  const contextLogger = logger.child({ function: getCommentsForPosts.name, babyId, postCount: postIds.length })
  const byPost: Record<string, Comment[]> = Object.fromEntries(postIds.map((id) => [id, []]))
  if (postIds.length === 0) return byPost

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()
  if (!user) return byPost

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  const userCircleIds = new Set(await getUserCircleIds(babyId, user.id))

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('post_comments')
      .select('*, users (*)')
      .in('post_id', postIds)
      .order('created_at', { ascending: true }),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching comments for posts"); return byPost }

  const visible = data.filter((comment) =>
    isAdmin || comment.user_id === user.id || comment.circle_ids.some((id: string) => userCircleIds.has(id))
  )
  const reactions = await getCommentReactionsForComments(visible.map((comment) => comment.id), babyId)

  for (const comment of visible) {
    byPost[comment.post_id]?.push({
      ...comment,
      nickname: nicknames[comment.user_id] ?? null,
      reactions: reactions[comment.id] ?? { breakdown: [], myEmoji: null },
    })
  }

  contextLogger.debug({ postCount: postIds.length }, "Comments for posts received")

  return byPost
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

// Batched form of getPollWithResults for rendering a whole feed page at
// once: does the auth/nickname lookups once instead of once per post.
export async function getPollsForPosts(postIds: string[], babyId: string): Promise<Record<string, PollWithResults | null>> {
  const contextLogger = logger.child({ function: getPollsForPosts.name, babyId, postCount: postIds.length })
  const byPost: Record<string, PollWithResults | null> = Object.fromEntries(postIds.map((id) => [id, null]))
  if (postIds.length === 0) return byPost

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('polls')
      .select('id, post_id, question, poll_options (id, label, position, poll_votes (user_id, users (first_name, last_name)))')
      .in('post_id', postIds),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching polls for posts"); return byPost }

  const tCommon = await getTranslations('common')
  for (const poll of data) {
    const sortedOptions = [...poll.poll_options].sort((a, b) => a.position - b.position)

    let myOptionId: string | null = null
    const options = sortedOptions.map((option) => {
      if (user && option.poll_votes.some((vote) => vote.user_id === user.id)) myOptionId = option.id
      const voterNames = option.poll_votes.map(({ user_id, users: voterOrList }) => {
        const voter = Array.isArray(voterOrList) ? voterOrList[0] : voterOrList
        return getDisplayName(voter, nicknames[user_id]) || tCommon('userFallback')
      })
      return { id: option.id, label: option.label, count: option.poll_votes.length, voterNames }
    })

    const totalVotes = options.reduce((sum, option) => sum + option.count, 0)

    byPost[poll.post_id] = { id: poll.id, question: poll.question, totalVotes, myOptionId, options }
  }

  return byPost
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

// Batched form for attaching reactions to a whole list of comments at once
// (used by getComments/getCommentsForPosts): does the nickname lookup once
// instead of once per comment.
export async function getCommentReactionsForComments(commentIds: string[], babyId: string): Promise<Record<string, ReactionsData>> {
  const contextLogger = logger.child({ function: getCommentReactionsForComments.name, babyId, commentCount: commentIds.length })
  const byComment: Record<string, ReactionsData> = Object.fromEntries(commentIds.map((id) => [id, { breakdown: [], myEmoji: null }]))
  if (commentIds.length === 0) return byComment

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('comment_reactions')
      .select('comment_id, emoji, user_id, users (first_name, last_name)')
      .in('comment_id', commentIds),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching comment reactions"); return byComment }

  const tCommon = await getTranslations('common')
  const namesByCommentEmoji = new Map<string, Map<string, string[]>>()
  const myEmojiByComment = new Map<string, string>()
  data.forEach(({ comment_id, emoji, user_id, users: reactorOrList }) => {
    const reactor = Array.isArray(reactorOrList) ? reactorOrList[0] : reactorOrList
    const name = getDisplayName(reactor, nicknames[user_id]) || tCommon('userFallback')
    const namesByEmoji = namesByCommentEmoji.get(comment_id) ?? new Map<string, string[]>()
    namesByEmoji.set(emoji, [...(namesByEmoji.get(emoji) ?? []), name])
    namesByCommentEmoji.set(comment_id, namesByEmoji)
    if (user && user_id === user.id) myEmojiByComment.set(comment_id, emoji)
  })

  for (const commentId of commentIds) {
    const namesByEmoji = namesByCommentEmoji.get(commentId)
    const breakdown = REACTIONS
      .map(({ emoji }) => ({ emoji, count: namesByEmoji?.get(emoji)?.length ?? 0, names: namesByEmoji?.get(emoji) ?? [] }))
      .filter((reaction) => reaction.count > 0)
    byComment[commentId] = { breakdown, myEmoji: myEmojiByComment.get(commentId) ?? null }
  }

  return byComment
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
