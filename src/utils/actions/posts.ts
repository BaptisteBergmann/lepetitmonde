'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Tables, TablesInsert } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { assertIsAdmin, getVisibleUserIds, getEmailsForUserIds } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { ensureBabyBucket, removeStorageObjects } from './storage'
import { linkPostPhotos } from './albums'
import { notifyUsers } from './notify'
import { sendNewPostEmails } from '@/utils/email'
import { Comment, getCommentsForPosts } from './comments'
import { ReactionsData, getReactionsForPosts } from './reactions'
import { PollWithResults, getPollsForPosts } from './polls'
import { PostViewsData, getPostViewsForPosts } from './views'
import { logger } from '../logger'

type NewPost = TablesInsert<'posts'>
export type PostPhotoWithUrl = Tables<'post_photos'> & { url: string | null; thumbnailUrl: string | null }
export type PostWithDetails = Tables<'posts'> & {
  circle_ids: string[]
  photos: PostPhotoWithUrl[]
  comments: Comment[]
  reactions: ReactionsData
  poll: PollWithResults | null
  views: PostViewsData
}

export async function createPost(post: NewPost, circleIds: string[], sendEmail: boolean) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createPost.name, babyId: post.baby_id })

  await assertIsAdmin(supabase, post.baby_id)
  await ensureBabyBucket(post.baby_id)

  const { data, error } = await supabase
    .from('posts')
    .insert([{
      id: post.id,
      baby_id: post.baby_id,
      taken_at: post.taken_at,
      caption: post.caption || null,
    }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating post"); throw error }

  if (circleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('posts_circles')
      .insert(circleIds.map((circleId) => ({ post_id: data.id, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking post circles"); throw circlesError }
  }

  contextLogger.info({ postId: data.id }, "Post created")

  const { data: { user } } = await supabase.auth.getUser()
  const recipients = await getVisibleUserIds(post.baby_id, circleIds, user?.id)
  const t = await getTranslations('pushNotifications')
  const body = post.caption || t('newPost.bodyFallback')
  await notifyUsers(post.baby_id, 'new_post', {
    title: t('newPost.title'),
    body,
    url: `/baby/${post.baby_id}/feed?postId=${data.id}`,
  }, recipients)

  if (sendEmail) {
    const { data: baby, error: babyError } = await supabase
      .from('babies')
      .select('baby_surname')
      .eq('id', post.baby_id)
      .single()

    if (babyError) {
      contextLogger.error(babyError, "Error fetching baby for new-post email")
    } else {
      const emails = await getEmailsForUserIds(recipients)
      const postUrl = `${process.env.SITE_URL}/baby/${post.baby_id}/feed?postId=${data.id}`
      await sendNewPostEmails(emails, baby.baby_surname, body, postUrl)
    }
  }

  return data.id
}

type PostUpdate = { caption: string | null; taken_at: string }

export async function updatePost(postId: string, babyId: string, update: PostUpdate, circleIds: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updatePost.name, postId, babyId })

  await assertIsAdmin(supabase, babyId)

  // Snapshot who could see this post *before* the circle change, so that
  // after re-linking we can notify only the people newly able to see it —
  // never re-notifying admins or members of a circle that was already
  // assigned (see getVisibleUserIds' "newly visible" doc comment).
  const { data: { user } } = await supabase.auth.getUser()
  const { data: oldLinks, error: oldLinksError } = await supabase
    .from('posts_circles')
    .select('circle_id')
    .eq('post_id', postId)

  if (oldLinksError) { contextLogger.error(oldLinksError, "Error fetching current post circles"); throw oldLinksError }

  const oldCircleIds = oldLinks.map((row) => row.circle_id)
  const previouslyVisible = new Set(await getVisibleUserIds(babyId, oldCircleIds, user?.id))

  const { error } = await supabase
    .from('posts')
    .update({
      taken_at: update.taken_at,
      caption: update.caption || null,
    })
    .eq('id', postId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating post"); throw error }

  const { error: deleteCirclesError } = await supabase
    .from('posts_circles')
    .delete()
    .eq('post_id', postId)

  if (deleteCirclesError) { contextLogger.error(deleteCirclesError, "Error clearing post circles"); throw deleteCirclesError }

  if (circleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('posts_circles')
      .insert(circleIds.map((circleId) => ({ post_id: postId, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking post circles"); throw circlesError }
  }

  contextLogger.info("Post updated")

  const nowVisible = await getVisibleUserIds(babyId, circleIds, user?.id)
  const newlyVisible = nowVisible.filter((id) => !previouslyVisible.has(id))
  if (newlyVisible.length > 0) {
    const t = await getTranslations('pushNotifications')
    await notifyUsers(babyId, 'new_post', {
      title: t('newPost.title'),
      body: update.caption || t('newPost.bodyFallback'),
      url: `/baby/${babyId}/feed?postId=${postId}`,
    }, newlyVisible)
  }

  revalidatePath(`/baby/${babyId}/feed`)
}

export async function attachPostPhotos(
  postId: string,
  babyId: string,
  files: { filename: string; mimeType: string; thumbnailFilename?: string }[]
) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: attachPostPhotos.name, postId, babyId })

  await assertIsAdmin(supabase, babyId)

  const photoRows = files.map(({ filename, mimeType, thumbnailFilename }, index) => ({
    post_id: postId,
    storage_path: `posts/${postId}/${filename}`,
    thumbnail_path: thumbnailFilename ? `posts/${postId}/thumbnails/${thumbnailFilename}` : null,
    position: index,
    mime_type: mimeType,
  }))

  const { error } = await supabase.from('post_photos').insert(photoRows)

  if (error) { contextLogger.error(error, "Error attaching post photos"); throw error }

  contextLogger.info({ count: files.length }, "Post photos attached")

  // Mirror onto the Photos page (see .claude/plans/post-story-photos-to-photo-page.md)
  // — shares the same storage objects just inserted above, no re-upload.
  await linkPostPhotos(postId, babyId, photoRows.map(({ storage_path, thumbnail_path, mime_type }) => ({
    storagePath: storage_path,
    thumbnailPath: thumbnail_path,
    mimeType: mime_type,
  })))

  revalidatePath(`/baby/${babyId}/feed`)
  revalidatePath(`/baby/${babyId}/albums`)
}

async function withVisibility(babyId: string) {
  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  const userCircleIds = new Set(user ? await getUserCircleIds(babyId, user.id) : [])

  return { supabase, isAdmin, userCircleIds }
}

async function toPostWithDetails(row: {
  baby_id: string
  posts_circles: { circle_id: string }[]
  post_photos: Tables<'post_photos'>[]
  [key: string]: unknown
}): Promise<PostWithDetails> {
  const { posts_circles, post_photos, ...post } = row
  const sortedPhotos = [...post_photos].sort((a, b) => a.position - b.position)
  const photos = sortedPhotos.map((photo) => ({
    ...photo,
    url: `/api/storage/${row.baby_id}/${photo.storage_path.split('/').map(encodeURIComponent).join('/')}`,
    thumbnailUrl: photo.thumbnail_path
      ? `/api/storage/${row.baby_id}/${photo.thumbnail_path.split('/').map(encodeURIComponent).join('/')}`
      : null,
  }))

  return {
    ...(post as Tables<'posts'>),
    circle_ids: posts_circles.map((pc) => pc.circle_id),
    photos,
    comments: [],
    reactions: { breakdown: [], myEmoji: null },
    poll: null,
    views: { count: 0, names: [] },
  }
}

// Fills in comments/reactions/poll/views for a batch of posts in one query
// per data type instead of one per post — the initial useEffect-per-post-
// card fan-out was the main source of request/DB load on a busy feed page.
async function attachInteractionData(babyId: string, posts: PostWithDetails[]): Promise<PostWithDetails[]> {
  if (posts.length === 0) return posts

  const postIds = posts.map((post) => post.id)
  const [comments, reactions, polls, views] = await Promise.all([
    getCommentsForPosts(postIds, babyId),
    getReactionsForPosts(postIds, babyId),
    getPollsForPosts(postIds, babyId),
    getPostViewsForPosts(posts.map((post) => ({ id: post.id, created_by: post.created_by })), babyId),
  ])

  return posts.map((post) => ({
    ...post,
    comments: comments[post.id] ?? [],
    reactions: reactions[post.id] ?? { breakdown: [], myEmoji: null },
    poll: polls[post.id] ?? null,
    views: views[post.id] ?? { count: 0, names: [] },
  }))
}

export async function getPosts(
  babyId: string,
  { limit, before }: { limit: number; before?: { takenAt: string; createdAt: string } }
): Promise<PostWithDetails[]> {
  const contextLogger = logger.child({ function: getPosts.name, babyId, limit, before })
  const { supabase, isAdmin, userCircleIds } = await withVisibility(babyId)

  let query = supabase
    .from('posts')
    .select('*, posts_circles (circle_id), post_photos (*)')
    .eq('baby_id', babyId)
    .order('taken_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.or(
      `taken_at.lt.${before.takenAt},and(taken_at.eq.${before.takenAt},created_at.lt.${before.createdAt})`
    )
  }

  const { data, error } = await query

  if (error) { contextLogger.error(error, "Error fetching posts"); return [] }

  const visibleRows = data.filter(
    (row) => isAdmin || row.posts_circles.some((pc: { circle_id: string }) => userCircleIds.has(pc.circle_id))
  )
  const visible = await attachInteractionData(babyId, await Promise.all(visibleRows.map(toPostWithDetails)))

  contextLogger.debug({ count: visible.length }, "Posts received")

  return visible
}

// Used to deep-link a notification straight to the post it concerns, even
// when that post isn't on the feed's first page. Returns null (not an
// error) when the post is missing/deleted or not visible to the caller, so
// callers can silently fall back to the normal feed.
export async function getPostById(postId: string, babyId: string): Promise<PostWithDetails | null> {
  const contextLogger = logger.child({ function: getPostById.name, postId, babyId })
  const { supabase, isAdmin, userCircleIds } = await withVisibility(babyId)

  const { data, error } = await supabase
    .from('posts')
    .select('*, posts_circles (circle_id), post_photos (*)')
    .eq('id', postId)
    .eq('baby_id', babyId)
    .maybeSingle()

  if (error) { contextLogger.error(error, "Error fetching post by id"); return null }
  if (!data) return null

  const visible = isAdmin || data.posts_circles.some((pc: { circle_id: string }) => userCircleIds.has(pc.circle_id))
  if (!visible) return null

  const [withDetails] = await attachInteractionData(babyId, [await toPostWithDetails(data)])
  return withDetails
}

export async function getPostsForRange(babyId: string, from: string, to: string): Promise<PostWithDetails[]> {
  const contextLogger = logger.child({ function: getPostsForRange.name, babyId, from, to })
  const { supabase, isAdmin, userCircleIds } = await withVisibility(babyId)

  const { data, error } = await supabase
    .from('posts')
    .select('*, posts_circles (circle_id), post_photos (*)')
    .eq('baby_id', babyId)
    .gte('taken_at', from)
    .lte('taken_at', to)

  if (error) { contextLogger.error(error, "Error fetching posts for range"); return [] }

  const visibleRows = data.filter(
    (row) => isAdmin || row.posts_circles.some((pc: { circle_id: string }) => userCircleIds.has(pc.circle_id))
  )
  const visible = await attachInteractionData(babyId, await Promise.all(visibleRows.map(toPostWithDetails)))

  contextLogger.debug({ count: visible.length }, "Posts for range received")

  return visible
}

export async function getPostActivityBeyond(babyId: string, from: string, to: string): Promise<{ hasBefore: boolean; hasAfter: boolean }> {
  const contextLogger = logger.child({ function: getPostActivityBeyond.name, babyId, from, to })
  const { supabase, isAdmin, userCircleIds } = await withVisibility(babyId)
  const isVisible = (circleIds: string[]) => isAdmin || circleIds.some((id) => userCircleIds.has(id))

  const [{ data: before, error: beforeError }, { data: after, error: afterError }] = await Promise.all([
    supabase.from('posts').select('posts_circles (circle_id)').eq('baby_id', babyId).lt('taken_at', from),
    supabase.from('posts').select('posts_circles (circle_id)').eq('baby_id', babyId).gt('taken_at', to),
  ])

  if (beforeError) contextLogger.error(beforeError, "Error checking earlier posts")
  if (afterError) contextLogger.error(afterError, "Error checking later posts")

  return {
    hasBefore: (before ?? []).some((row) => isVisible(row.posts_circles.map((pc) => pc.circle_id))),
    hasAfter: (after ?? []).some((row) => isVisible(row.posts_circles.map((pc) => pc.circle_id))),
  }
}

export async function deletePost(postId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deletePost.name, postId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data: photos, error: photosError } = await supabase
    .from('post_photos')
    .select('storage_path, thumbnail_path')
    .eq('post_id', postId)

  if (photosError) { contextLogger.error(photosError, "Error fetching post photos before delete"); throw photosError }

  if (photos.length > 0) {
    const paths = photos.flatMap((p) => p.thumbnail_path ? [p.storage_path, p.thumbnail_path] : [p.storage_path])
    await removeStorageObjects(babyId, paths)
  }

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting post"); throw error }

  contextLogger.info("Post deleted")

  revalidatePath(`/baby/${babyId}/feed`)
  revalidatePath(`/baby/${babyId}/albums`)
}
