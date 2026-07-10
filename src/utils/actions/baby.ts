"use server"
import { createClient } from "@utils/supabase/server"
import { cache } from "react"

export const getBabiesList = cache(async () => {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: babies, error } = await supabase
    .from('babies')
    .select('*')

  if (error) {
    console.error("Erreur de récupération :", error)
    return []
  }


  const babiesWithAdminStatus = babies.map((baby) => ({
    ...baby,
    isAdmin: baby.owner_id === user.id // Calcule true ou false pour chaque ligne
  }))

  console.log("aa", babiesWithAdminStatus)

  return babiesWithAdminStatus
})
