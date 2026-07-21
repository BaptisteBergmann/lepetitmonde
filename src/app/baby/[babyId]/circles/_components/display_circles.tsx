
"use client";

import { useEffect, useState } from "react";
import { Tables } from "@utils/supabase/database.types";
import { useBabyRealtime } from "@/utils/hooks/use-baby-realtime";
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

  // Permet de synchroniser l'état si les props serveur changent (ex: navigation)
  useEffect(() => {
    setCircles(initialCircles);
  }, [initialCircles]);

  useBabyRealtime(babyId, (event) => {
    if (event.table !== "circles") return;
    if (event.eventType === "INSERT") {
      const newCircle = event.new as Circle;
      setCircles((prev) => [...prev, newCircle]);
    } else if (event.eventType === "DELETE") {
      const oldCircle = event.old as Circle;
      setCircles((prev) => prev.filter((q) => q.id !== oldCircle.id));
    } else if (event.eventType === "UPDATE") {
      const updatedCircle = event.new as Circle;
      setCircles((prev) =>
        prev.map((q) => (q.id === updatedCircle.id ? updatedCircle : q))
      );
    }
  });

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
