"use client";

import { useRouter, useSearchParams } from 'next/navigation';

export default function ProjectSelector({ projects }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentProjectId = searchParams.get('projectId');

  const handleSelect = (id: string) => {
    // Création d'un nouvel objet URLSearchParams pour préserver les autres paramètres
    const params = new URLSearchParams(searchParams.toString());

    if (id) {
      params.set('projectId', id);
    } else {
      params.delete('projectId');
    }

    // On met à jour l'URL : Next.js va recharger la page serveur avec ces nouveaux paramètres
    router.push(`?${params.toString()}`);
  };

  return (
    <select
      value={currentProjectId || ''}
      onChange={(e) => handleSelect(e.target.value)}
      className="p-2 border rounded-md"
    >
      <option value="">Choisir un bébé</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.project_name}</option>
      ))}
    </select>
  );
}
