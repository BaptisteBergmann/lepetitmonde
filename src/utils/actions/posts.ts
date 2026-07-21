'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Tables, TablesInsert } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { ensureBabyBucket, getSignedUrl } from './storage'
import { logger } from '../logger'

type NewPost = TablesInsert<'posts'>
export type PostPhotoWithUrl = Tables<'post_photos'> & { url: string | null }
export type PostWithDetails = Tables<'posts'> & {
  circle_ids: string[]
  photos: PostPhotoWithUrl[]
}

export async function createPost(post: NewPost, circleIds: string[]) {
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

  return data.id
}

export async function attachPostPhotos(postId: string, babyId: string, filenames: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: attachPostPhotos.name, postId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { error } = await supabase
    .from('post_photos')
    .insert(filenames.map((filename, index) => ({
      post_id: postId,
      storage_path: `posts/${postId}/${filename}`,
      position: index,
    })))

  if (error) { contextLogger.error(error, "Error attaching post photos"); throw error }

  contextLogger.info({ count: filenames.length }, "Post photos attached")

  revalidatePath(`/baby/${babyId}/feed`)
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
  const photos = await Promise.all(
    sortedPhotos.map(async (photo) => ({
      ...photo,
      url: (await getSignedUrl(row.baby_id, photo.storage_path))?.signedUrl ?? null,
    }))
  )

  return {
    ...(post as Tables<'posts'>),
    circle_ids: posts_circles.map((pc) => pc.circle_id),
    photos,
  }
}

export async function getPosts(babyId: string, { limit, before }: { limit: number; before?: string }): Promise<PostWithDetails[]> {
  const contextLogger = logger.child({ function: getPosts.name, babyId, limit, before })
  const { supabase, isAdmin, userCircleIds } = await withVisibility(babyId)

  let query = supabase
    .from('posts')
    .select('*, posts_circles (circle_id), post_photos (*)')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) query = query.lt('created_at', before)

  const { data, error } = await query

  if (error) { contextLogger.error(error, "Error fetching posts"); return [] }

  const visibleRows = data.filter(
    (row) => isAdmin || row.posts_circles.some((pc: { circle_id: string }) => userCircleIds.has(pc.circle_id))
  )
  const visible = await Promise.all(visibleRows.map(toPostWithDetails))

  contextLogger.debug({ count: visible.length }, "Posts received")

  return visible
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
  const visible = await Promise.all(visibleRows.map(toPostWithDetails))

  contextLogger.debug({ count: visible.length }, "Posts for range received")

  return visible
}

export async function deletePost(postId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deletePost.name, postId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data: photos, error: photosError } = await supabase
    .from('post_photos')
    .select('storage_path')
    .eq('post_id', postId)

  if (photosError) { contextLogger.error(photosError, "Error fetching post photos before delete"); throw photosError }

  if (photos.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(babyId)
      .remove(photos.map((p) => p.storage_path))

    if (removeError) { contextLogger.error(removeError, "Error removing post photos from storage"); throw removeError }
  }

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting post"); throw error }

  contextLogger.info("Post deleted")

  revalidatePath(`/baby/${babyId}/feed`)
}
