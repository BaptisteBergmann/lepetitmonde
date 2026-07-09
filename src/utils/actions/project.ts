"use server"
import { createClient } from "@utils/supabase/server"


export async function getProjectsList() {
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
}

export async function getIsAdmin(babyId: string) {
  const supabase = await createClient()
  // 1. Récupérer l'ID de l'utilisateur connecté
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // 2. Demander à Supabase si la ligne combinant le babyId et l'user_id existe
  const { error, count } = await supabase
    .from('babies')
    .select('*', { count: 'exact', head: true }) // head: true n'extrait pas la donnée, optimisant la vitesse
    .eq('id', babyId)
    .eq('owner_id', user.id) // Le check se fait ici, au niveau de la requête

  if (error) {
    console.error("Erreur de récupération :", error)
    return false
  }

  // Si count vaut 1, la ligne existe (l'utilisateur possède le projet), donc true
  return count === 1
}
