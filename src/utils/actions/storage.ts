'use server'

import { createClient } from '@utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

// Bucket creation is an admin-only operation under Supabase Storage's RLS model
// (storage.buckets has no INSERT policy for authenticated users), so it requires
// the service role key. Callers must verify the user is authorized for babyId
// (e.g. via assertIsAdmin) before calling this.
export async function ensureBabyBucket(babyId: string) {
  const contextLogger = logger.child({ function: ensureBabyBucket.name, babyId })
  const supabaseAdmin = createAdminClient(process.env.SUPABASE_URL!, process.env.SERVICE_ROLE_KEY!)

  const { error } = await supabaseAdmin.storage.createBucket(babyId, { public: false })

  if (error && !error.message.toLowerCase().includes('already exists')) {
    contextLogger.error(error, "Error creating baby bucket")
    throw error
  }
}

export async function getSignedUrl(babyId: string, path: string, expiresIn: number = 3600) {
  const supabase = await createClient()

  const rep = await supabase.storage.from(babyId).createSignedUrl(path, expiresIn)

  if (rep.error) { console.log("Error geting the image", rep.error); return null }

  return rep.data
}

export async function getImage(babyId: string, imageId: string) {
  return getSignedUrl(babyId, `images/${imageId}`)
}
