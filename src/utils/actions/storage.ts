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

export async function removeStorageObjects(babyId: string, paths: string[]) {
  const contextLogger = logger.child({ function: removeStorageObjects.name, babyId })
  const supabaseAdmin = createAdminClient()

  const { error } = await supabaseAdmin.storage.from(babyId).remove(paths)

  if (error) {
    contextLogger.error(error, "Error removing storage objects")
    throw error
  }
}
