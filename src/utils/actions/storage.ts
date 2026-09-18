'use server'

import { createAdminClient } from '@utils/supabase/admin'
import { logger } from '@/utils/logger'

// Every storage operation here runs via the service role since this project
// defines no storage.buckets / storage.objects RLS policies. Callers must
// verify the user is authorized for babyId (e.g. via assertIsAdmin) first.
export async function ensureBabyBucket(babyId: string) {
  const contextLogger = logger.child({ function: ensureBabyBucket.name, babyId })
  const supabaseAdmin = createAdminClient()

  const { error } = await supabaseAdmin.storage.createBucket(babyId, { public: false })

  if (error && !error.message.toLowerCase().includes('already exists')) {
    contextLogger.error(error, "Error creating baby bucket")
    throw error
  }
}

const BUG_REPORTS_BUCKET = 'bug-reports'

// Returns the bucket name after making sure it exists, so callers never
// need a separate non-async export (illegal in a "use server" file).
export async function ensureBugReportsBucket() {
  const contextLogger = logger.child({ function: ensureBugReportsBucket.name })
  const supabaseAdmin = createAdminClient()

  const { error } = await supabaseAdmin.storage.createBucket(BUG_REPORTS_BUCKET, { public: false })

  if (error && !error.message.toLowerCase().includes('already exists')) {
    contextLogger.error(error, "Error creating bug reports bucket")
    throw error
  }

  return BUG_REPORTS_BUCKET
}

export async function removeStorageObjects(babyId: string, paths: string[]) {
  const contextLogger = logger.child({ function: removeStorageObjects.name, babyId })
  const supabaseAdmin = createAdminClient()

  const { error } = await supabaseAdmin.storage.from(babyId).remove(paths)

  if (error) {
    contextLogger.error(error, "Error removing storage objects")
    throw error
  }
}

// Storage-to-storage duplication (no download/re-upload round trip) — used
// to give a story's media a permanent, independent copy on the Photos page
// (see copyStoryPhotoToLibrary in albums.ts) so it survives the story
// itself expiring or being deleted.
export async function copyStorageObject(babyId: string, fromPath: string, toPath: string) {
  const contextLogger = logger.child({ function: copyStorageObject.name, babyId, fromPath, toPath })
  const supabaseAdmin = createAdminClient()

  const { error } = await supabaseAdmin.storage.from(babyId).copy(fromPath, toPath)

  if (error) {
    contextLogger.error(error, "Error copying storage object")
    throw error
  }
}
