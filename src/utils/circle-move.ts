// Client-side preview of what moving a circle changes (display only: the database
// triggers stay the source of truth). Pure so the admin dialogs can import it.
import { ancestorsOrSelf, descendantsOrSelf, rootOf, type CircleNode } from './circle-tree'

type Access = { circle_id: string; user_id: string }

// Users who would be a direct member of two circles of the merged tree once `circleId`
// (with its subtree) is placed under `newParentId`. Mirrors circles_check_hierarchy.
export function membershipConflicts(
  circleId: string,
  newParentId: string | null,
  nodes: CircleNode[],
  access: Access[],
): string[] {
  if (!newParentId) return []
  const moved = descendantsOrSelf([circleId], nodes)
  const dest = descendantsOrSelf([rootOf(newParentId, nodes)], nodes)

  const inMoved = new Set(access.filter((a) => moved.has(a.circle_id)).map((a) => a.user_id))
  const conflicting = new Set<string>()
  for (const a of access) {
    if (dest.has(a.circle_id) && !moved.has(a.circle_id) && inMoved.has(a.user_id)) conflicting.add(a.user_id)
  }
  return Array.from(conflicting)
}

export type MoveImpactEntry = { circleId: string; userIds: string[] }

// For each ancestor the circle starts or stops reaching, the people (members of the
// moved subtree) who gain or lose sight of what is shared with that ancestor.
export function moveImpact(
  circleId: string,
  newParentId: string | null,
  nodes: CircleNode[],
  access: Access[],
): { gains: MoveImpactEntry[]; loses: MoveImpactEntry[] } {
  const moved = descendantsOrSelf([circleId], nodes)
  const oldParent = nodes.find((n) => n.id === circleId)?.parent_circle ?? null
  const oldAncestors = oldParent ? ancestorsOrSelf([oldParent], nodes) : new Set<string>()
  const newAncestors = newParentId ? ancestorsOrSelf([newParentId], nodes) : new Set<string>()
  const movedMembers = new Set(access.filter((a) => moved.has(a.circle_id)).map((a) => a.user_id))

  // Who reaches `ancestorId` without going through the moved subtree.
  function reachedElsewhere(ancestorId: string) {
    const below = descendantsOrSelf([ancestorId], nodes)
    return new Set(access.filter((a) => below.has(a.circle_id) && !moved.has(a.circle_id)).map((a) => a.user_id))
  }

  function entries(circleIds: Iterable<string>) {
    const result: MoveImpactEntry[] = []
    for (const id of circleIds) {
      const elsewhere = reachedElsewhere(id)
      const userIds = Array.from(movedMembers).filter((u) => !elsewhere.has(u))
      if (userIds.length > 0) result.push({ circleId: id, userIds })
    }
    return result
  }

  return {
    gains: entries(Array.from(newAncestors).filter((id) => !oldAncestors.has(id))),
    loses: entries(Array.from(oldAncestors).filter((id) => !newAncestors.has(id))),
  }
}
