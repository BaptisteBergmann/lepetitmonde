
"use client";

import { useConfirm } from '@/components/confirm_provider'
import { toast } from 'sonner'
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tables } from "@utils/supabase/database.types";
import { useBabyRealtime } from "@/utils/hooks/use-baby-realtime";
import { addUserToCircle, removeUserFromCircle, deleteCircle } from "@utils/actions/circles";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CircleDot, CircleOff, Trash2, X, UserPlus } from "lucide-react";

type Circle = Tables<'circles'>;
type CircleAccess = Tables<'circles_access'>;
type User = Tables<'users'>;

interface RealtimeCirclesListProps {
  initialCircles: Circle[];
  initialCirclesAccess: CircleAccess[];
  users: User[];
  babyId: string;
  isAdmin: boolean;
}

function getMemberLabel(user: User | undefined, t: (key: string, values?: Record<string, string | number | Date>) => string) {
  if (!user) return t('unknownMember');
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName || t('memberFallback', { id: user.id.substring(0, 8) });
}

export default function RealtimeCirclesList({
  initialCircles,
  initialCirclesAccess,
  users,
  babyId,
  isAdmin,
}: RealtimeCirclesListProps) {
  const t = useTranslations('admin.circles');
  const confirmAction = useConfirm()
  const [circles, setCircles] = useState<Circle[]>(initialCircles);
  const [circlesAccess, setCirclesAccess] = useState<CircleAccess[]>(initialCirclesAccess);
  const [selectedUserByCircle, setSelectedUserByCircle] = useState<Record<string, string>>({});
  const [pendingCircleId, setPendingCircleId] = useState<string | null>(null);

  // Permet de synchroniser l'état si les props serveur changent (ex: navigation).
  // Ajusté pendant le rendu plutôt que dans un effect (cf. react.dev "You Might
  // Not Need An Effect" — adjusting state when a prop changes).
  const [prevInitialCircles, setPrevInitialCircles] = useState(initialCircles);
  if (initialCircles !== prevInitialCircles) {
    setPrevInitialCircles(initialCircles);
    setCircles(initialCircles);
  }

  const [prevInitialCirclesAccess, setPrevInitialCirclesAccess] = useState(initialCirclesAccess);
  if (initialCirclesAccess !== prevInitialCirclesAccess) {
    setPrevInitialCirclesAccess(initialCirclesAccess);
    setCirclesAccess(initialCirclesAccess);
  }

  useBabyRealtime(babyId, (event) => {
    if (event.table === "circles") {
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
    } else if (event.table === "circles_access") {
      if (event.eventType === "INSERT") {
        const newAccess = event.new as CircleAccess;
        setCirclesAccess((prev) => [...prev, newAccess]);
      } else if (event.eventType === "DELETE") {
        const oldAccess = event.old as CircleAccess;
        setCirclesAccess((prev) => prev.filter((a) => a.id !== oldAccess.id));
      }
    }
  });

  const handleAddMember = async (circleId: string) => {
    const userId = selectedUserByCircle[circleId];
    if (!userId) return;
    setPendingCircleId(circleId);
    try {
      await addUserToCircle(circleId, userId, babyId);
      setSelectedUserByCircle((prev) => ({ ...prev, [circleId]: "" }));
    } catch (err) {
      console.error(err);
      toast.error(t('addMemberError'));
    } finally {
      setPendingCircleId(null);
    }
  };

  const handleRemoveMember = async (circleId: string, userId: string) => {
    setPendingCircleId(circleId);
    try {
      await removeUserFromCircle(circleId, userId, babyId);
    } catch (err) {
      console.error(err);
      toast.error(t('removeMemberError'));
    } finally {
      setPendingCircleId(null);
    }
  };

  const handleDeleteCircle = async (circle: Circle) => {
    if (!(await confirmAction(t('deleteConfirm', { name: circle.name ?? '' })))) return;
    setPendingCircleId(circle.id);
    try {
      await deleteCircle(circle.id, babyId);
    } catch (err) {
      console.error(err);
      toast.error(t('deleteError'));
    } finally {
      setPendingCircleId(null);
    }
  };

  const usersWithoutCircle = users.filter(
    (u) => !circlesAccess.some((a) => a.user_id === u.id)
  );

  if (circles.length === 0) {
    return (
      <div className="divide-y divide-landing-border">
        <div className="text-center py-10 text-landing-muted px-4">
          <p className="text-sm font-medium">{t('empty')}</p>
          <p className="text-xs text-landing-muted mt-1">{t('emptyHint')}</p>
        </div>
        {usersWithoutCircle.length > 0 && (
          <UsersWithoutCircle users={usersWithoutCircle} />
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-landing-border">
      {circles.map((circle) => {
        const memberIds = new Set(
          circlesAccess.filter((a) => a.circle_id === circle.id).map((a) => a.user_id)
        );
        const members = users.filter((u) => memberIds.has(u.id));
        const availableUsers = users.filter((u) => !memberIds.has(u.id));
        const isPending = pendingCircleId === circle.id;

        return (
          <div key={circle.id} className="py-3.5 px-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-rose/10 text-rose p-2 rounded-xl">
                  <CircleDot className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-landing-foreground">{circle.name}</p>
                  <p className="text-[10px] text-landing-muted font-mono">ID: {circle.id.substring(0, 8)}...</p>
                </div>
              </div>

              {isAdmin && (
                <Button
                  onClick={() => handleDeleteCircle(circle)}
                  disabled={isPending}
                  variant="outline"
                  size="xs"
                  className="rounded-xl cursor-pointer text-destructive hover:text-destructive shrink-0"
                  title={t('deleteTitle')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {members.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-1">
                {members.map((member) => (
                  <span
                    key={member.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-landing-background pl-2.5 pr-1 py-1 text-xs font-medium text-landing-foreground"
                  >
                    {getMemberLabel(member, t)}
                    {isAdmin && (
                      <button
                        onClick={() => handleRemoveMember(circle.id, member.id)}
                        disabled={isPending}
                        className="rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive cursor-pointer touch-target relative"
                        title={t('removeTitle')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {isAdmin && availableUsers.length > 0 && (
              <div className="flex items-center gap-2 pl-1">
                <Select
                  value={selectedUserByCircle[circle.id] || ""}
                  onValueChange={(value: string | null) =>
                    setSelectedUserByCircle((prev) => ({ ...prev, [circle.id]: value || "" }))
                  }
                >
                  <SelectTrigger size="sm" className="flex-1 min-w-0">
                    <SelectValue placeholder={t('addMemberPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {getMemberLabel(user, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handleAddMember(circle.id)}
                  disabled={isPending || !selectedUserByCircle[circle.id]}
                  variant="outline"
                  size="xs"
                  className="rounded-xl cursor-pointer gap-1 shrink-0"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>{t('add')}</span>
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {usersWithoutCircle.length > 0 && (
        <UsersWithoutCircle users={usersWithoutCircle} />
      )}
    </div>
  );
}

function UsersWithoutCircle({ users }: { users: User[] }) {
  const t = useTranslations('admin.circles');
  return (
    <div className="py-3.5 px-6 space-y-3">
      <div className="flex items-center gap-3">
        <div className="bg-landing-muted/10 text-landing-muted p-2 rounded-xl">
          <CircleOff className="h-4 w-4" />
        </div>
        <div>
          <p className="font-semibold text-sm text-landing-foreground">{t('withoutCircle')}</p>
          <p className="text-[10px] text-landing-muted">{t('withoutCircleDescription')}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-1">
        {users.map((user) => (
          <span
            key={user.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-landing-background pl-2.5 pr-2.5 py-1 text-xs font-medium text-landing-foreground"
          >
            {getMemberLabel(user, t)}
          </span>
        ))}
      </div>
    </div>
  );
}
