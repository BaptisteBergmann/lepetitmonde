"use client";

import { useRouter, useSearchParams } from 'next/navigation';

export default function BabySelector({ babies }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentBabyId = searchParams.get('babyId');

  const handleSelect = (id: string) => {
    // Création d'un nouvel objet URLSearchParams pour préserver les autres paramètres
    const params = new URLSearchParams(searchParams.toString());

    if (id) {
      params.set('babyId', id);
    } else {
      params.delete('babyId');
    }

    // On met à jour l'URL : Next.js va recharger la page serveur avec ces nouveaux paramètres
    router.push(`?${params.toString()}`);
  };

  return (
    <select
      value={currentBabyId || ''}
      onChange={(e) => handleSelect(e.target.value)}
      className="p-2 border rounded-md"
    >
      <option value="">Choisir un bébé</option>
      {babies.map((p) => (
        <option key={p.id} value={p.id}>{p.baby_name}</option>
      ))}
    </select>
  );
}
