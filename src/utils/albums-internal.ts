// Photos-page mirroring helpers for posts and stories, plus the album
// ownership guard used by the album Server Actions.
//
// Deliberately NOT a 'use server' module: these take postId/storyId, babyId
// and storage paths with no auth or ownership check of their own (and
// copyStoryPhotoToLibrary copies storage objects via the service role), so
// they must never be callable as endpoints. Callers (attachPostPhotos in
// posts.ts, createStory in stories.ts) verify admin access and ownership
// first.
import 'server-only'
import { createClient } from '@utils/supabase/server'
import { copyStorageObject } from '@utils/actions/storage'
import { actionError } from '@utils/actions/errors'
import { logger } from '@utils/logger'

export async function nextUnsortedPosition(supabase: Awaited<ReturnType<typeof createClient>>, babyId: string) {
  const { count, error } = await supabase
    .from('album_photos')
    .select('id', { count: 'exact', head: true })
    .eq('baby_id', babyId)
    .is('album_id', null)

  if (error) throw error
  return count ?? 0
}

// Called by posts.ts's attachPostPhotos (after its admin + post ownership
// checks), right after its own post_photos insert succeeds. The mirrored row shares the post's actual
// storage_path/thumbnail_path — no second upload, no duplicated storage —
// landing in the same "unsorted" pool as directly-uploaded photos.
// source_post_id is ON DELETE CASCADE (see the migration), so deleting the
// post removes this row automatically, at the same time its storage goes
// (deletePost already removes that separately).
export async function linkPostPhotos(
  postId: string,
  babyId: string,
  files: { storagePath: string; thumbnailPath: string | null; mimeType: string }[]
) {
  const supabase = await createClient()
  const baseIndex = await nextUnsortedPosition(supabase, babyId)

  const { error } = await supabase
    .from('album_photos')
    .insert(files.map(({ storagePath, thumbnailPath, mimeType }, index) => ({
      album_id: null,
      baby_id: babyId,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      position: baseIndex + index,
      mime_type: mimeType,
      source_post_id: postId,
    })))

  if (error) throw error
}

// Called by stories.ts's createStory (after its admin check). Makes a real, independent copy of the
// story's media (and thumbnail, if any) into photos/${babyId}/${storyId}/...
// — deliberately NOT a shared reference like linkPostPhotos above — so the
// Photos-page entry survives the story disappearing (expiry via
// pruneExpiredStories in stories.ts, or an explicit delete). source_story_id
// is ON DELETE SET NULL: purely an informational backlink, never a reason
// to remove this row.
export async function copyStoryPhotoToLibrary(
  storyId: string,
  babyId: string,
  file: { storagePath: string; thumbnailPath: string | null; mimeType: string }
) {
  const supabase = await createClient()

  const folder = `photos/${babyId}/${storyId}`
  const mediaFilename = file.storagePath.split('/').pop()!
  const newStoragePath = `${folder}/${mediaFilename}`
  await copyStorageObject(babyId, file.storagePath, newStoragePath)

  let newThumbnailPath: string | null = null
  if (file.thumbnailPath) {
    const thumbnailFilename = file.thumbnailPath.split('/').pop()!
    newThumbnailPath = `${folder}/thumbnails/${thumbnailFilename}`
    await copyStorageObject(babyId, file.thumbnailPath, newThumbnailPath)
  }

  const position = await nextUnsortedPosition(supabase, babyId)

  const { error } = await supabase
    .from('album_photos')
    .insert([{
      album_id: null,
      baby_id: babyId,
      storage_path: newStoragePath,
      thumbnail_path: newThumbnailPath,
      position,
      mime_type: file.mimeType,
      source_story_id: storyId,
    }])

  if (error) throw error
}

// Album tables have no RLS yet (see .claude/plans/rls.md), so assertIsAdmin
// alone only proves the caller administers `babyId`, not that `albumId`
// belongs to it. Missing and foreign albums fail the same way so ids can't be
// probed.
export async function assertAlbumInBaby(albumId: string, babyId: string) {
  const contextLogger = logger.child({ function: 'assertAlbumInBaby', albumId, babyId })
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('albums')
    .select('id')
    .eq('id', albumId)
    .eq('baby_id', babyId)
    .maybeSingle()

  if (error) contextLogger.error(error, "Error checking album")
  if (error || !data) throw await actionError('unauthorized')
}
