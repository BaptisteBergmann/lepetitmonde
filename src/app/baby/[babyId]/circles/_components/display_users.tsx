
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@utils/supabase/client"; // Ajustez selon votre chemin d'accès
import { Tables } from "@utils/supabase/database.types";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { sendNotification } from "@/utils/actions/notifications";
import { Bell } from "lucide-react";

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
    return (
      <div className="text-center py-10 text-muted-foreground px-4">
        <p className="text-sm font-medium">Aucun membre dans ce journal pour le moment.</p>
        <p className="text-xs text-muted-foreground mt-1">Invitez des proches à rejoindre l&apos;aventure.</p>
      </div>
    );
  }

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const f = firstName?.trim().charAt(0) || "";
    const l = lastName?.trim().charAt(0) || "";
    return (f + l).toUpperCase() || "U";
  };

  return (
    <div className="divide-y divide-border">
      {users.map((user) => {
        const initials = getInitials(user.first_name, user.last_name);
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
        
        return (
          <div
            key={user.id}
            className="flex items-center justify-between py-3.5 px-6 hover:bg-muted/30 transition-colors gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 select-none">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">
                  {fullName || `Membre (${user.id.substring(0, 8)})`}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  ID: {user.id}
                </p>
              </div>
            </div>

            <Button
              onClick={() => sendNotification("hello", user.id)}
              variant="outline"
              size="xs"
              className="rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Bell className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Notifier</span>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
