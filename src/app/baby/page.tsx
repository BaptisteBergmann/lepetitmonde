import { createClient } from "@utils/supabase/server"

// app/dashboard/page.tsx (Serveur)
export default async function DashboardPage({ searchParams }) {
  // On récupère le paramètre directement
  const { projectId } = await searchParams;
  const supabase = await createClient()

  // Si aucun projet n'est sélectionné, on affiche un message d'accueil
  if (!projectId) {
    return <div className="p-10 text-center">Sélectionnez un projet dans le menu pour voir les détails.</div>;
  }

  // Requête à Supabase basée sur le projet sélectionné
  // RLS garantit que l'utilisateur a bien accès à ce projet (project_access)
  const { data: details } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  return (
    <div>
      <h1>Détails pour : {details.project_name}</h1>
      {/* ... Votre contenu spécifique au bébé ... */}
    </div>
  );
}
