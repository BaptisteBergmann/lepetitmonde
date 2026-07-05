// app/page.tsx (ou n'importe quelle autre page)

import { createClient } from "@/src/utils/supabase/server"


export default async function PageJeu() {
  // 1. Initialiser le client côté serveur
  const supabase = await createClient()

  // 2. Faire la requête à votre base de données locale
  const { data: pronostics, error } = await supabase
    .from('Pronostic')
    .select('*')

  if (error) {
    console.error("Erreur de récupération :", error)
  }

  // 3. Afficher les données
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Pronostics pour Bébé 👶</h1>

      <ul>
        {pronostics?.map((pari) => (
          <li key={pari.id} className="mb-2">
            <strong>{pari.nomFamille}</strong> a parié sur un poids de {pari.poidsEstime} kg !
          </li>
        ))}
      </ul>
    </main>
  )
}
