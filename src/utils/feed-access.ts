// Ownership/visibility guards for the feed's Server Actions.
//
// Deliberately NOT a 'use server' module: these take ids and return data
// about them, so exposing them as callable endpoints would turn them into
// an existence/visibility oracle. Only import from server code.
//
// Every child id (post, story, comment, poll, option, highlight, circle)
// coming from the client must be checked against `babyId` here before an
// action reads or writes it: feed tables have no RLS yet (see
// .claude/plans/rls.md), so these checks are the only protection. A missing
// item and a hidden item fail the same way so callers can't probe ids.
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import type { Tables } from '@utils/supabase/database.types'
import { getUserAccess } from '@utils/actions/users'
import { getUserCircleIds } from '@utils/actions/circles'
import { actionError } from '@utils/actions/errors'
import { logger } from '@utils/logger'

export type FeedViewer = {
  userId: string
  isAdmin: boolean
  circleIds: Set<string>
}

// Same rule as withVisibility/getPosts in posts.ts: admins see everything in
// their baby; others need at least one shared circle. No circle = admin-only.
function canSee(viewer: FeedViewer, itemCircleIds: string[]) {
  return viewer.isAdmin || itemCircleIds.some((id) => viewer.circleIds.has(id))
}

export async function getFeedViewer(babyId: string): Promise<FeedViewer | null> {
  const { data: { user } } = await getAuthUser()
  if (!user) return null

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) return null

  const isAdmin = access.access_level === 'admin'
  const circleIds = new Set(await getUserCircleIds(babyId, user.id))

  return { userId: user.id, isAdmin, circleIds }
}

export async function assertMember(babyId: string): Promise<FeedViewer> {
  const viewer = await getFeedViewer(babyId)
  if (!viewer) throw await actionError('unauthorized')
  return viewer
}

export async function assertAdmin(babyId: string): Promise<FeedViewer> {
  const viewer = await getFeedViewer(babyId)
  if (!viewer?.isAdmin) throw await actionError('unauthorized')
  return viewer
}

export type VisiblePost = { id: string; created_by: string; circleIds: string[] }

export async function findVisiblePost(
  postId: string,
  babyId: string,
  viewerArg?: FeedViewer | null
): Promise<{ viewer: FeedViewer; post: VisiblePost } | null> {
  const contextLogger = logger.child({ function: 'findVisiblePost', postId, babyId })
  const viewer = viewerArg === undefined ? await getFeedViewer(babyId) : viewerArg
  if (!viewer) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('posts')
    .select('id, created_by, posts_circles (circle_id)')
    .eq('id', postId)
    .eq('baby_id', babyId)
    .maybeSingle()

  if (error) { contextLogger.error(error, "Error checking post visibility"); return null }
  if (!data) return null

  const circleIds = data.posts_circles.map((pc) => pc.circle_id)
  if (!canSee(viewer, circleIds)) return null

  return { viewer, post: { id: data.id, created_by: data.created_by, circleIds } }
}

export async function assertPostVisible(postId: string, babyId: string, viewer?: FeedViewer | null) {
  const found = await findVisiblePost(postId, babyId, viewer)
  if (!found) throw await actionError('unauthorized')
  return found
}

export type VisibleStory = { id: string; created_by: string | null; circleIds: string[] }

export async function findVisibleStory(
  storyId: string,
  babyId: string,
  viewerArg?: FeedViewer | null
): Promise<{ viewer: FeedViewer; story: VisibleStory } | null> {
  const contextLogger = logger.child({ function: 'findVisibleStory', storyId, babyId })
  const viewer = viewerArg === undefined ? await getFeedViewer(babyId) : viewerArg
  if (!viewer) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stories')
    .select('id, created_by, stories_circles (circle_id)')
    .eq('id', storyId)
    .eq('baby_id', babyId)
    .maybeSingle()

  if (error) { contextLogger.error(error, "Error checking story visibility"); return null }
  if (!data) return null

  const circleIds = data.stories_circles.map((sc) => sc.circle_id)
  if (!canSee(viewer, circleIds)) return null

  return { viewer, story: { id: data.id, created_by: data.created_by, circleIds } }
}

export async function assertStoryVisible(storyId: string, babyId: string, viewer?: FeedViewer | null) {
  const found = await findVisibleStory(storyId, babyId, viewer)
  if (!found) throw await actionError('unauthorized')
  return found
}

export type VisibleComment = Pick<Tables<'post_comments'>, 'id' | 'post_id' | 'user_id' | 'circle_ids'>

// The parent post must be visible AND the comment itself must be visible
// (admin, its author, or a circle overlap with the commenter's circles at
// the time — same rule as getComments).
export async function assertCommentVisible(commentId: string, babyId: string, viewerArg?: FeedViewer | null) {
  const contextLogger = logger.child({ function: 'assertCommentVisible', commentId, babyId })
  const viewer = viewerArg === undefined ? await getFeedViewer(babyId) : viewerArg
  if (!viewer) throw await actionError('unauthorized')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('post_comments')
    .select('id, post_id, user_id, circle_ids, posts!inner (baby_id, posts_circles (circle_id))')
    .eq('id', commentId)
    .eq('posts.baby_id', babyId)
    .maybeSingle()

  if (error) contextLogger.error(error, "Error checking comment visibility")
  if (error || !data) throw await actionError('unauthorized')

  const post = Array.isArray(data.posts) ? data.posts[0] : data.posts
  if (!post || post.baby_id !== babyId) throw await actionError('unauthorized')

  const postVisible = canSee(viewer, post.posts_circles.map((pc) => pc.circle_id))
  const commentVisible = viewer.isAdmin
    || data.user_id === viewer.userId
    || (data.circle_ids as string[]).some((id) => viewer.circleIds.has(id))
  if (!postVisible || !commentVisible) throw await actionError('unauthorized')

  const comment: VisibleComment = { id: data.id, post_id: data.post_id, user_id: data.user_id, circle_ids: data.circle_ids }
  return { viewer, comment }
}

export async function assertPollVisible(pollId: string, babyId: string, viewerArg?: FeedViewer | null) {
  const contextLogger = logger.child({ function: 'assertPollVisible', pollId, babyId })
  const viewer = viewerArg === undefined ? await getFeedViewer(babyId) : viewerArg
  if (!viewer) throw await actionError('unauthorized')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('polls')
    .select('id, post_id, posts!inner (baby_id, posts_circles (circle_id))')
    .eq('id', pollId)
    .eq('posts.baby_id', babyId)
    .maybeSingle()

  if (error) contextLogger.error(error, "Error checking poll visibility")
  if (error || !data) throw await actionError('unauthorized')

  const post = Array.isArray(data.posts) ? data.posts[0] : data.posts
  if (!post || post.baby_id !== babyId) throw await actionError('unauthorized')
  if (!canSee(viewer, post.posts_circles.map((pc) => pc.circle_id))) throw await actionError('unauthorized')

  return { viewer, poll: { id: data.id, post_id: data.post_id } }
}

export async function assertOptionInPoll(optionId: string, pollId: string) {
  const contextLogger = logger.child({ function: 'assertOptionInPoll', optionId, pollId })
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('poll_options')
    .select('id')
    .eq('id', optionId)
    .eq('poll_id', pollId)
    .maybeSingle()

  if (error) contextLogger.error(error, "Error checking poll option")
  if (error || !data) throw await actionError('unauthorized')
}

export async function assertHighlightInBaby(highlightId: string, babyId: string) {
  const contextLogger = logger.child({ function: 'assertHighlightInBaby', highlightId, babyId })
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('story_highlights')
    .select('id')
    .eq('id', highlightId)
    .eq('baby_id', babyId)
    .maybeSingle()

  if (error) contextLogger.error(error, "Error checking highlight")
  if (error || !data) throw await actionError('unauthorized')
}

export async function assertCirclesInBaby(circleIds: string[], babyId: string) {
  const unique = Array.from(new Set(circleIds))
  if (unique.length === 0) return

  const contextLogger = logger.child({ function: 'assertCirclesInBaby', babyId, circleCount: unique.length })
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('circles')
    .select('id')
    .in('id', unique)
    .eq('baby_id', babyId)

  if (error) contextLogger.error(error, "Error checking circles")
  if (error || data.length !== unique.length) throw await actionError('unauthorized')
}
