"use client";

import { useRouter, useParams, usePathname } from 'next/navigation';

// J'ajoute une interface typée (Optionnelle mais recommandée)
interface Baby {
  id: string;
  baby_name: string;
}

export default function BabySelector({ babies }: { babies: Baby[] }) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname(); // Permet de savoir sur quelle sous-page on est (ex: /baby/123/timeline)

  // On récupère l'ID depuis l'URL dynamique (ex: app/baby/[babyId]/...)
  // Assure-toi que le nom de ton dossier correspond bien à 'babyId'
  const currentBabyId = params?.babyId as string;

  const handleSelect = (newId: string) => {
    if (!newId) {
      // Si l'utilisateur sélectionne "Choisir un bébé", on le renvoie à la racine de l'app
      router.push('/');
      return;
    }

    if (currentBabyId && pathname.includes(`/baby/${currentBabyId}`)) {
      const newPath = pathname.replace(`/baby/${currentBabyId}`, `/baby/${newId}`);
      router.push(newPath);
    } else {
      router.push(`/baby/${newId}`);
    }
  };

  return (
    <select
      value={currentBabyId || ''}
      onChange={(e) => handleSelect(e.target.value)}
      className="p-2 border rounded-md"
    >
      <option value="">Choisir un bébé</option>
      {babies.map((p) => (
        <option key={p.id} value={p.id}>
          {p.baby_name}
        </option>
      ))}
    </select>
  );
}
