
"use client";

import { useEffect, useState } from "react";
import { Tables } from "@utils/supabase/database.types";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { sendNotification } from "@/utils/actions/notifications";
import { useBabyRealtime } from "@/utils/hooks/use-baby-realtime";
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

  const contextLogger = logger.child({
    module: 'RealtimeUsersList',
  });


  // Permet de synchroniser l'état si les props serveur changent (ex: navigation)
  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  useBabyRealtime(babyId, (event) => {
    if (event.table !== "users") return;
    if (event.eventType === "INSERT") {
      const newUser = event.new as User;
      setUsers((prev) => [...prev, newUser]);
    } else if (event.eventType === "DELETE") {
      const oldUser = event.old as User;
      setUsers((prev) => prev.filter((q) => q.id !== oldUser.id));
    } else if (event.eventType === "UPDATE") {
      const updatedUser = event.new as User;
      setUsers((prev) =>
        prev.map((q) => (q.id === updatedUser.id ? updatedUser : q))
      );
    }
  });

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
