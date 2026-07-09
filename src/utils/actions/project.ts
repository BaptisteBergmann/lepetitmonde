"use server"
import { createClient } from "@/src/utils/supabase/server"


export async function getProjectsList() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')

  if (error) {
    console.error("Erreur de récupération :", error)
    return []
  }


  const projectsWithAdminStatus = projects.map((project) => ({
    ...project,
    isAdmin: project.owner_id === user.id // Calcule true ou false pour chaque ligne
  }))

  console.log("aa", projectsWithAdminStatus)

  return projectsWithAdminStatus
}

export async function getIsAdmin(projectId: string) {
  const supabase = await createClient()
  // 1. Récupérer l'ID de l'utilisateur connecté
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // 2. Demander à Supabase si la ligne combinant le projectId et l'user_id existe
  const { error, count } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true }) // head: true n'extrait pas la donnée, optimisant la vitesse
    .eq('id', projectId)
    .eq('owner_id', user.id) // Le check se fait ici, au niveau de la requête

  if (error) {
    console.error("Erreur de récupération :", error)
    return false
  }

  // Si count vaut 1, la ligne existe (l'utilisateur possède le projet), donc true
  return count === 1
}
