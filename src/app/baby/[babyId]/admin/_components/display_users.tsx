
"use client";

import { useEffect, useState } from "react";
import { Tables, Enums } from "@utils/supabase/database.types";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { sendNotification } from "@/utils/actions/notifications";
import { updateUserAccessLevel } from "@/utils/actions/users";
import { useBabyRealtime } from "@/utils/hooks/use-baby-realtime";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell } from "lucide-react";

type User = Tables<'users'> & { access_level: Enums<'role'> };

interface RealtimeUsersListProps {
  initialUsers: User[];
  babyId: string;
  isAdmin: boolean;
}

const ACCESS_LEVEL_LABELS: Record<Enums<'role'>, string> = {
  admin: "Administrateur",
  viewer: "Lecteur",
};

export default function RealtimeUsersList({
  initialUsers,
  babyId,
  isAdmin,
}: RealtimeUsersListProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

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

  const handleAccessLevelChange = async (userId: string, accessLevel: Enums<'role'>) => {
    const previousAccessLevel = users.find((u) => u.id === userId)?.access_level;
    setPendingUserId(userId);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, access_level: accessLevel } : u))
    );
    try {
      await updateUserAccessLevel(babyId, userId, accessLevel);
    } catch (err) {
      console.error(err);
      if (previousAccessLevel) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, access_level: previousAccessLevel } : u))
        );
      }
      alert(err instanceof Error ? err.message : "Erreur lors de la mise à jour du niveau d'accès.");
    } finally {
      setPendingUserId(null);
    }
  };

  contextLogger.info(users, "Get user")
  if (users.length === 0) {
    return (
      <div className="text-center py-10 text-landing-muted px-4">
        <p className="text-sm font-medium">Aucun membre dans ce journal pour le moment.</p>
        <p className="text-xs text-landing-muted mt-1">Invitez des proches à rejoindre l&apos;aventure.</p>
      </div>
    );
  }

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const f = firstName?.trim().charAt(0) || "";
    const l = lastName?.trim().charAt(0) || "";
    return (f + l).toUpperCase() || "U";
  };

  const adminCount = users.filter((u) => u.access_level === "admin").length;

  return (
    <div className="divide-y divide-landing-border">
      {users.map((user) => {
        const initials = getInitials(user.first_name, user.last_name);
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
        const isLastAdmin = user.access_level === "admin" && adminCount <= 1;

        return (
          <div
            key={user.id}
            className="flex items-center justify-between py-3.5 px-6 hover:bg-landing-background/60 transition-colors gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 select-none">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-landing-foreground truncate">
                  {fullName || `Membre (${user.id.substring(0, 8)})`}
                </p>
                <p className="text-[10px] text-landing-muted truncate">
                  ID: {user.id}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isAdmin ? (
                <div title={isLastAdmin ? "Impossible de retirer le dernier administrateur." : undefined}>
                  <Select
                    value={user.access_level}
                    onValueChange={(value: string | null) =>
                      value && handleAccessLevelChange(user.id, value as Enums<'role'>)
                    }
                    disabled={pendingUserId === user.id || isLastAdmin}
                  >
                    <SelectTrigger size="sm" className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ACCESS_LEVEL_LABELS) as Enums<'role'>[]).map((level) => (
                        <SelectItem key={level} value={level}>
                          {ACCESS_LEVEL_LABELS[level]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className="text-xs font-medium text-landing-muted">
                  {ACCESS_LEVEL_LABELS[user.access_level]}
                </span>
              )}

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
          </div>
        );
      })}
    </div>
  );
}
