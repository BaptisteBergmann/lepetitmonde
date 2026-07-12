
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@utils/supabase/client"; // Ajustez selon votre chemin d'accès
import { Tables } from "@utils/supabase/database.types";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { sendNotification } from "@/utils/actions/notifications";

type User = Tables<'users'>;

interface RealtimeUsersListProps {
  initialUsers: User[];
  babyId: string;
  isAdmin: boolean;
}

export default function RealtimeUsersList({
  initialUsers,
  babyId,
}: RealtimeUsersListProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const supabase = createClient();

  console.log(users)
  const contextLogger = logger.child({
    module: 'RealtimeUsersList',
  });


  // Permet de synchroniser l'état si les props serveur changent (ex: navigation)
  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  useEffect(() => {
    // Écoute en temps réel uniquement les changements sur la table guess_users
    const channel = supabase
      .channel(`realtime-users-${babyId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Écoute INSERT, UPDATE, DELETE
          schema: "public",
          table: "users", // Remplacez par le nom exact de votre table
          filter: `baby_id=eq.${babyId}`, // Filtre uniquement pour ce bébé/projet
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newUser = payload.new as User;
            setUsers((prev) => [...prev, newUser]);
          } else if (payload.eventType === "DELETE") {
            setUsers((prev) => prev.filter((q) => q.id !== payload.old.id));
          } else if (payload.eventType === "UPDATE") {
            const updatedUser = payload.new as User;
            setUsers((prev) =>
              prev.map((q) => (q.id === updatedUser.id ? updatedUser : q))
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

  contextLogger.info(users, "Get user")
  if (users.length === 0) {
    return <p className="text-gray-500 mt-4 text-sm">Aucun pronostic créé pour le moment.</p>;
  }

  return (
    <ul className="mt-6 space-y-2">
      {users.map((user) => (
        <li key={user.id} className="border-b py-2 text-black dark:text-white">
          <span className="font-medium">User :</span> {user.id} {user.first_name} {user.last_name}
          <Button onClick={() => sendNotification("hello", user.id)}>
            Send notif
          </Button>
        </li>
      ))}
    </ul>
  );
}
