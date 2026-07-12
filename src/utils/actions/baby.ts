"use server"
import { createClient } from "@utils/supabase/server"
import { cache } from "react"

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

  const { data: baby, error } = await supabase
    .from('babies')
    .select('*')
    .eq("id", babyId)
    .single()

  if (error) {
    console.error("Erreur de récupération :", error)
    return []
  }

  return { ...baby, isAdmin: baby.owner_id === user.id }
})

