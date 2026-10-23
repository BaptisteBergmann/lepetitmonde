"use server"
import { createClient } from "@utils/supabase/server"
import { cache } from "react"
import { logger } from "@utils/logger"
import { getUserAccess } from "./users"

export const getBabiesList = cache(async () => {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: babies, error } = await supabase
    .from('babies')
    .select('*, baby_access!inner (*)')
    .eq('baby_access.user_id', user.id)

  if (error) {
    console.error("Erreur de récupération :", error)
    return []
  }

  return babies
})

export const getBaby = cache(async (babyId: string) => {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Members only: non-members get the same "not found" result as signed-out callers.
  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) return []

  const { data: baby, error } = await supabase
    .from('babies')
    .select('*')
    .eq("id", babyId)
    .single()

  if (error) {
    logger.child({ function: 'getBaby', babyId }).error(error, "Error fetching baby")
    return []
  }

  return baby
})

