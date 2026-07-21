'use server'

import { createClient } from '@utils/supabase/server'
import { logger } from '@/utils/logger'

export async function ensureBabyBucket(babyId: string) {
  const contextLogger = logger.child({ function: ensureBabyBucket.name, babyId })
  const supabase = await createClient()

  const { error } = await supabase.storage.createBucket(babyId, { public: false })

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
