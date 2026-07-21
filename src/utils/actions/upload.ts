"use server"

import { createClient } from "@utils/supabase/server"
import { logger } from "@/utils/logger"

export async function uploadFile(
  bucketName: string,
  path: string,
  file: File,
  options: { cacheControl: string; upsert: boolean }
) {
  const contextLogger = logger.child({ function: uploadFile.name, bucketName, path })
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non authentifié")

  const { error } = await supabase.storage.from(bucketName).upload(path, file, options)

  if (error) {
    contextLogger.error(error, "Error uploading file")
    return { error: error.message }
  }

  return { error: undefined }
}
