"use client";

import { useConfirm } from '@/components/confirm_provider'
import { toast } from 'sonner'
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tables } from "@utils/supabase/database.types";
import { useBabyRealtime } from "@/utils/hooks/use-baby-realtime";
import { addUserToCircle, removeUserFromCircle, deleteCircle, moveCircleMember } from "@utils/actions/circles";
import { CIRCLE_MAX_DEPTH, depthOf, descendantsOrSelf, orderAsTree, rootOf } from "@utils/circle-tree";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft, ChevronDown, ChevronRight, CircleDot, CircleOff, Loader2, MoreHorizontal, Plus, Trash2, X, UserPlus } from "lucide-react";
import { getMemberLabel } from "./circle_utils";
import AddSubCircleDialog from "./add_sub_circle_dialog";
import MoveCircleDialog from "./move_circle_dialog";

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

export default function RealtimeCirclesList({
  initialCircles,
  initialCirclesAccess,
  users,
  babyId,
  isAdmin,
}: RealtimeCirclesListProps) {
  const t = useTranslations('admin.circles');
  const tServer = useTranslations('serverErrors');
  const confirmAction = useConfirm()
  const router = useRouter();
  const [circles, setCircles] = useState<Circle[]>(initialCircles);
  const [circlesAccess, setCirclesAccess] = useState<CircleAccess[]>(initialCirclesAccess);
  const [selectedUserByCircle, setSelectedUserByCircle] = useState<Record<string, string>>({});
  const [pendingCircleId, setPendingCircleId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [movingCircle, setMovingCircle] = useState<Circle | null>(null);
  const [addingSubTo, setAddingSubTo] = useState<Circle | null>(null);

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
        setCircles((prev) => (prev.some((c) => c.id === newCircle.id) ? prev : [...prev, newCircle]));
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
      // The relay sends a bare signal (no row); the refreshed server props are
      // picked up by the sync block above.
      router.refresh();
    }
  });

  const nodes = useMemo(() => circles.map((c) => ({ id: c.id, parent_circle: c.parent_circle })), [circles]);
  const ordered = useMemo(() => orderAsTree(circles), [circles]);
  const circleById = useMemo(() => new Map(circles.map((c) => [c.id, c])), [circles]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Circle[]>();
    const ids = new Set(circles.map((c) => c.id));
    for (const circle of ordered) {
      const key = circle.parent_circle && ids.has(circle.parent_circle) ? circle.parent_circle : null;
      const list = map.get(key);
      if (list) list.push(circle);
      else map.set(key, [circle]);
    }
    return map;
  }, [ordered, circles]);

  const directMembers = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of circlesAccess) {
      const set = map.get(a.circle_id);
      if (set) set.add(a.user_id);
      else map.set(a.circle_id, new Set([a.user_id]));
    }
    return map;
  }, [circlesAccess]);

  const memberItems = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, getMemberLabel(u, t)])),
    [users, t],
  );

  const hasNesting = circles.some((c) => c.parent_circle);

  // Everyone who sees what is shared with `circleId`, and which sub-circles they come from.
  function audienceOf(circleId: string) {
    const direct = directMembers.get(circleId) ?? new Set<string>();
    const inherited = new Map<string, string[]>();
    const below = descendantsOrSelf([circleId], nodes);
    for (const orderedCircle of ordered) {
      if (orderedCircle.id === circleId || !below.has(orderedCircle.id)) continue;
      for (const userId of directMembers.get(orderedCircle.id) ?? []) {
        if (direct.has(userId)) continue;
        const via = inherited.get(userId);
        if (via) via.push(orderedCircle.name ?? '');
        else inherited.set(userId, [orderedCircle.name ?? '']);
      }
    }
    return { direct, inherited, total: direct.size + inherited.size };
  }

  const handleAddMember = async (circle: Circle) => {
    const userId = selectedUserByCircle[circle.id];
    if (!userId) return;
    setPendingCircleId(circle.id);
    try {
      // One circle per tree: someone already in another circle of this tree is moved.
      const treeIds = descendantsOrSelf([rootOf(circle.id, nodes)], nodes);
      const existing = circlesAccess.find((a) => a.user_id === userId && treeIds.has(a.circle_id));
      const result = existing
        ? await moveCircleMember({ babyId, accessId: existing.id, toCircleId: circle.id })
        : await addUserToCircle(circle.id, userId, babyId);
      if (result.error) {
        toast.error(tServer(result.error));
        return;
      }
      if (existing) {
        toast.success(t('memberMoved', {
          name: getMemberLabel(userById.get(userId), t),
          from: circleById.get(existing.circle_id)?.name ?? '',
          to: circle.name ?? '',
        }));
      }
      setSelectedUserByCircle((prev) => ({ ...prev, [circle.id]: "" }));
      router.refresh();
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
    const name = circle.name ?? '';
    const childCount = childrenOf.get(circle.id)?.length ?? 0;
    const parentName = circle.parent_circle ? circleById.get(circle.parent_circle)?.name ?? '' : '';
    let description: string;
    if (childCount === 0) description = t('deleteConfirm', { name });
    else if (circle.parent_circle) description = t('deleteConfirmWithChildren', { name, count: childCount, parent: parentName });
    else description = t('deleteConfirmWithChildrenTop', { name, count: childCount });

    if (!(await confirmAction({ title: t('deleteTitle'), description }))) return;
    setPendingCircleId(circle.id);
    try {
      await deleteCircle(circle.id, babyId);
      toast.success(t('deleted'));
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(t('deleteError'));
    } finally {
      setPendingCircleId(null);
    }
  };

  const toggleCollapsed = (circleId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(circleId)) next.delete(circleId);
      else next.add(circleId);
      return next;
    });

  const usersWithoutCircle = users.filter(
    (u) => !circlesAccess.some((a) => a.user_id === u.id)
  );

  if (circles.length === 0) {
    return (
      <div className="divide-y divide-landing-border">
        <div className="text-center py-10 text-landing-muted px-4">
          <p className="text-sm font-medium">{t('empty')}</p>
          <p className="text-xs text-landing-muted mt-1">{t('emptyHint')}</p>
          <p className="text-xs text-landing-muted mt-1">{t('emptyNestingHint')}</p>
        </div>
        {usersWithoutCircle.length > 0 && (
          <UsersWithoutCircle users={usersWithoutCircle} />
        )}
      </div>
    );
  }

  function renderCircle(circle: Circle, depth: number) {
    const { direct, inherited, total } = audienceOf(circle.id);
    const members = users.filter((u) => direct.has(u.id));
    const children = childrenOf.get(circle.id) ?? [];
    const isCollapsed = collapsed.has(circle.id);
    const isPending = pendingCircleId === circle.id;
    const name = circle.name ?? '';
    const atMaxDepth = depthOf(circle.id, nodes) >= CIRCLE_MAX_DEPTH;

    // Add-member options: nobody in this tree yet is listed normally; people in another
    // circle of the same tree go in their own group and are moved on selection.
    const treeIds = descendantsOrSelf([rootOf(circle.id, nodes)], nodes);
    const treeRowByUser = new Map<string, CircleAccess>();
    for (const a of circlesAccess) if (treeIds.has(a.circle_id)) treeRowByUser.set(a.user_id, a);
    const freeUsers = users.filter((u) => !treeRowByUser.has(u.id));
    const otherCircleUsers = users.filter((u) => {
      const row = treeRowByUser.get(u.id);
      return row && row.circle_id !== circle.id;
    });

    const inheritedChips = Array.from(inherited.entries()).map(([userId, via]) => {
      const member = getMemberLabel(userById.get(userId), t);
      return via.length > 1
        ? t('inheritedMore', { name: member, circle: via[0], count: via.length - 1 })
        : t('inheritedFrom', { name: member, circle: via[0] });
    });

    return (
      <li
        key={circle.id}
        aria-busy={isPending}
        className={depth > 0 ? "ml-5 border-l-2 border-landing-border pl-3" : "px-6"}
      >
        <div className="space-y-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {children.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleCollapsed(circle.id)}
                  className="touch-target relative shrink-0 rounded-full p-1 text-landing-muted hover:text-landing-foreground cursor-pointer"
                  aria-label={t(isCollapsed ? 'expandChildren' : 'collapseChildren', { name })}
                  aria-expanded={!isCollapsed}
                  aria-controls={`circle-children-${circle.id}`}
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-6 shrink-0" aria-hidden="true" />
              )}
              <div className="bg-rose/10 text-rose p-2 rounded-xl shrink-0">
                <CircleDot className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-landing-foreground break-words">{name}</p>
                <p className="text-xs text-landing-muted">
                  {direct.size === 0 && total === 0
                    ? t('noMembers')
                    : total > direct.size
                      ? t('audienceCount', { direct: direct.size, audience: total })
                      : t('membersCount', { count: direct.size })}
                </p>
              </div>
            </div>

            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="icon" className="rounded-xl cursor-pointer shrink-0" aria-label={t('actionsFor', { name })} disabled={isPending} />}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem className="min-h-11 cursor-pointer gap-2" disabled={atMaxDepth} onClick={() => setAddingSubTo(circle)}>
                    <Plus className="h-4 w-4" />
                    <span className="flex flex-col">
                      {t('addSubCircle')}
                      {atMaxDepth && <span className="text-xs text-muted-foreground">{t('maxDepthHint')}</span>}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11 cursor-pointer gap-2" onClick={() => setMovingCircle(circle)}>
                    <ArrowRightLeft className="h-4 w-4" />
                    {t('moveAction')}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" className="min-h-11 cursor-pointer gap-2" onClick={() => handleDeleteCircle(circle)}>
                    <Trash2 className="h-4 w-4" />
                    {t('deleteTitle')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {(members.length > 0 || inheritedChips.length > 0) && (
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
                      aria-label={t('removeFromCircle', { member: getMemberLabel(member, t), circle: name })}
                      title={t('removeTitle')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
              {inheritedChips.map((label, index) => (
                <span
                  key={`inherited-${index}`}
                  className="inline-flex items-center rounded-full border border-dashed border-landing-border px-2.5 py-1 text-xs text-landing-muted"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {isAdmin && (freeUsers.length > 0 || otherCircleUsers.length > 0) && (
            <div className="flex items-center gap-2 pl-1">
              <Select
                items={memberItems}
                value={selectedUserByCircle[circle.id] || ""}
                onValueChange={(value: string | null) =>
                  setSelectedUserByCircle((prev) => ({ ...prev, [circle.id]: value || "" }))
                }
              >
                <SelectTrigger size="sm" className="flex-1 min-w-0">
                  <SelectValue placeholder={t('addMemberPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {freeUsers.length > 0 && (
                    <SelectGroup>
                      {freeUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {getMemberLabel(user, t)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {otherCircleUsers.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>{t('otherCircleInTreeGroup')}</SelectLabel>
                      {otherCircleUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {t('inOtherCircle', {
                            name: getMemberLabel(user, t),
                            circle: circleById.get(treeRowByUser.get(user.id)!.circle_id)?.name ?? '',
                          })}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={() => handleAddMember(circle)}
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

        {children.length > 0 && !isCollapsed && (
          <ul id={`circle-children-${circle.id}`}>
            {children.map((child) => renderCircle(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  const roots = childrenOf.get(null) ?? [];

  return (
    <div className="divide-y divide-landing-border">
      {hasNesting && (
        <p className="px-6 pb-3 text-xs text-landing-muted flex flex-wrap items-center gap-1.5">
          <span className="inline-flex rounded-full border border-dashed border-landing-border px-2 py-0.5" aria-hidden="true">…</span>
          {t('legend')}
        </p>
      )}
      <ul aria-label={t('treeLabel')} className="divide-y divide-landing-border">
        {roots.map((root) => renderCircle(root, 0))}
      </ul>
      {usersWithoutCircle.length > 0 && (
        <UsersWithoutCircle users={usersWithoutCircle} />
      )}
      {movingCircle && (
        <MoveCircleDialog
          key={movingCircle.id}
          circle={movingCircle}
          circles={circles}
          circlesAccess={circlesAccess}
          users={users}
          babyId={babyId}
          onClose={() => setMovingCircle(null)}
          onPendingChange={setPendingCircleId}
        />
      )}
      {addingSubTo && (
        <AddSubCircleDialog parent={addingSubTo} babyId={babyId} onClose={() => setAddingSubTo(null)} />
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
          <p className="text-xs text-landing-muted">{t('withoutCircleDescription')}</p>
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
