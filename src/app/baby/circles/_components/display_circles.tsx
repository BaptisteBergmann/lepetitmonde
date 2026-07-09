
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@utils/supabase/client"; // Ajustez selon votre chemin d'accès
import { Tables } from "@utils/supabase/database.types";

type Circle = Tables<'circles'>;

interface RealtimeCirclesListProps {
  initialCircles: Circle[];
  projectId: string;
  isAdmin: boolean;
}

export default function RealtimeCirclesList({
  initialCircles,
  projectId,
}: RealtimeCirclesListProps) {
  const [circles, setCircles] = useState<Circle[]>(initialCircles);
  const supabase = createClient();

  console.log(circles)


  // Permet de synchroniser l'état si les props serveur changent (ex: navigation)
  useEffect(() => {
    setCircles(initialCircles);
  }, [initialCircles]);

  useEffect(() => {
    // Écoute en temps réel uniquement les changements sur la table guess_circles
    const channel = supabase
      .channel(`realtime-circles-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Écoute INSERT, UPDATE, DELETE
          schema: "public",
          table: "circles", // Remplacez par le nom exact de votre table
          filter: `project_id=eq.${projectId}`, // Filtre uniquement pour ce bébé/projet
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newCircle = payload.new as Circle;
            setCircles((prev) => [...prev, newCircle]);
          } else if (payload.eventType === "DELETE") {
            setCircles((prev) => prev.filter((q) => q.id !== payload.old.id));
          } else if (payload.eventType === "UPDATE") {
            const updatedCircle = payload.new as Circle;
            setCircles((prev) =>
              prev.map((q) => (q.id === updatedCircle.id ? updatedCircle : q))
            );
          }
        }
      )
      .subscribe();

    // Nettoyage de la connexion WebSocket quand l'utilisateur quitte la page
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, supabase]);

  if (circles.length === 0) {
    return <p className="text-gray-500 mt-4 text-sm">Aucun pronostic créé pour le moment.</p>;
  }

  return (
    <ul className="mt-6 space-y-2">
      {circles.map((circle) => (
        <li key={circle.id} className="border-b py-2 text-black dark:text-white">
          <span className="font-medium">Circle :</span> {circle.name}
        </li>
      ))}
    </ul>
  );
}
