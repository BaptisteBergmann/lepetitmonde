
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@utils/supabase/client"; // Ajustez selon votre chemin d'accès
import { Tables } from "@utils/supabase/database.types";
import { CircleDot } from "lucide-react";

type Circle = Tables<'circles'>;

interface RealtimeCirclesListProps {
  initialCircles: Circle[];
  babyId: string;
  isAdmin: boolean;
}

export default function RealtimeCirclesList({
  initialCircles,
  babyId,
}: RealtimeCirclesListProps) {
  const [circles, setCircles] = useState<Circle[]>(initialCircles);
  const supabase = createClient();

  // Permet de synchroniser l'état si les props serveur changent (ex: navigation)
  useEffect(() => {
    setCircles(initialCircles);
  }, [initialCircles]);

  useEffect(() => {
    // Écoute en temps réel uniquement les changements sur la table guess_circles
    const channel = supabase
      .channel(`realtime-circles-${babyId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Écoute INSERT, UPDATE, DELETE
          schema: "public",
          table: "circles", // Remplacez par le nom exact de votre table
          filter: `baby_id=eq.${babyId}`, // Filtre uniquement pour ce bébé/projet
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
  }, [babyId, supabase]);

  if (circles.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground px-4">
        <p className="text-sm font-medium">Aucun cercle de partage créé pour le moment.</p>
        <p className="text-xs text-muted-foreground mt-1">Utilisez le formulaire ci-contre pour créer votre premier groupe.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {circles.map((circle) => (
        <div
          key={circle.id}
          className="flex items-center justify-between py-3.5 px-6 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="bg-rose/10 text-rose p-2 rounded-xl">
              <CircleDot className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">{circle.name}</p>
              <p className="text-[10px] text-muted-foreground font-mono">ID: {circle.id.substring(0, 8)}...</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
