
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Tables, Enums } from "@utils/supabase/database.types";
import { logger } from "@/utils/logger";
import { Button, buttonVariants } from "@/components/ui/button";
import { sendNotification, MemberDevice } from "@/utils/actions/notifications";
import { updateUserAccessLevel } from "@/utils/actions/users";
import { useBabyRealtime } from "@/utils/hooks/use-baby-realtime";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Smartphone } from "lucide-react";
import { cn } from "@utils/utils";

type User = Tables<'users'> & { access_level: Enums<'role'> };

interface RealtimeUsersListProps {
  initialUsers: User[];
  babyId: string;
  isAdmin: boolean;
  devicesByUser: Record<string, MemberDevice[]>;
}

const ACCESS_LEVEL_LABELS: Record<Enums<'role'>, string> = {
  admin: "Administrateur",
  viewer: "Lecteur",
};

export default function RealtimeUsersList({
  initialUsers,
  babyId,
  isAdmin,
  devicesByUser,
}: RealtimeUsersListProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [sendingUserId, setSendingUserId] = useState<string | null>(null);
  const router = useRouter();

  const contextLogger = logger.child({
    module: 'RealtimeUsersList',
  });


  // Permet de synchroniser l'état si les props serveur changent (ex: navigation)
  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  useBabyRealtime(babyId, (event) => {
    if (event.table === "baby_access") {
      // Membership just changed (joined/left/access level updated) — the payload only
      // carries the baby_access row, not the joined user profile, so refetch from the
      // server rather than trying to reconstruct it client-side.
      router.refresh();
    } else if (event.table === "users") {
      // Profile edit (name/nickname). Not baby-scoped at the DB level, so only apply it
      // if this person is already a member shown in this list.
      const updatedUser = event.new as Tables<'users'>;
      setUsers((prev) =>
        prev.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u))
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

  const handleNotify = async (userId: string) => {
    setSendingUserId(userId);
    try {
      await sendNotification("hello", userId);
      toast.success("Notification envoyée.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'envoi de la notification.");
    } finally {
      setSendingUserId(null);
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
        const joinedDate = user.created_at
          ? format(new Date(user.created_at), "d MMM yyyy", { locale: fr })
          : null;
        const devices = devicesByUser[user.id] ?? [];
        const hasPush = devices.length > 0;

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
                  {user.nickname && (
                    <span className="ml-1.5 font-normal text-landing-muted">
                      &laquo; {user.nickname} &raquo;
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-landing-muted truncate">
                  {joinedDate ? `Membre depuis le ${joinedDate}` : `ID: ${user.id}`}
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

              {isAdmin && hasPush && (
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      buttonVariants({ variant: "outline", size: "xs" }),
                      "flex items-center gap-1.5 cursor-pointer shrink-0"
                    )}
                  >
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <span className="hidden sm:inline">Notifier</span>
                    <span className="text-[10px] text-landing-muted">({devices.length})</span>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64">
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Appareils enregistrés
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {devices.map((device) => (
                          <div key={device.id} className="flex items-center gap-1.5 text-sm min-w-0">
                            <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{device.device_label ?? "Appareil inconnu"}</span>
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={() => handleNotify(user.id)}
                        size="sm"
                        className="rounded-xl w-full cursor-pointer gap-1.5 mt-1"
                        disabled={sendingUserId === user.id}
                      >
                        <Bell className="h-3.5 w-3.5" />
                        {sendingUserId === user.id ? "Envoi..." : "Envoyer une notification"}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
