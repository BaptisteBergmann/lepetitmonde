---
tags: [lepetitmonde/feature, security]
---

# Circles

Up: [[Le petit monde]] · See also [[Authorization]], [[Admin console]] · Code: `src/utils/circle-tree.ts`, `src/utils/circle-parents.ts`, `src/utils/circle-move.ts`, `actions/circles.ts`, `src/components/circle_picker.tsx`

Circles are groups of members inside one baby. Admins nest them into a **tree** (for example Family, then Close family, then Grandparents) so content shared with a broad circle also reaches the circles inside it.

## The tree

- `circles.parent_circle` points to the parent. Each circle has at most one parent, the parent belongs to the same baby (composite foreign key), and the maximum depth is **3**.
- A trigger (`circles_check_hierarchy`) rejects cycles (`circle_hierarchy_cycle`) and depth overflows (`circle_hierarchy_depth`) and serializes edits per baby with an advisory lock.
- Deleting a circle **moves its children up one level** (`circles_reparent_children`, a BEFORE DELETE trigger). Caveat: deleting a parent and its child in the same multi-row statement fails, because the trigger tries to re-parent a row that is being deleted. Delete leaf-first, or null `parent_circle` first. The app deletes one circle at a time, so it is not affected.
- The pure helpers in `circle-tree.ts` (`ancestorsOrSelf`, `descendantsOrSelf`, `validParentIds`, `orderAsTree`...) are shared by the server and the client. A cookie-bound, cached loader (`circle-parents.ts`, 5 s TTL) feeds them on the server.

## Who sees what

For a user `u`, the **effective circles** are their direct circles plus all ancestors.

1. An item tagged with circles `T` is visible to `u` when `u` is admin or `T` intersects the effective circles. Sharing with Family therefore reaches someone who is only in Grandparents. No circle still means admin-only.
2. Notification and email recipients are admins plus the members of the tagged circles and every circle below them.
3. Only what was ticked is stored. A picker that ticks "Family" stores the Family id, and the sub-circles are included implicitly, so moving a circle later updates the audience of existing content.
4. Comments store a snapshot of the author's **direct** circles. A comment is visible when those circles plus their ancestors intersect the viewer's effective circles (or the viewer is admin or the author).

The same rule exists in SQL: `is_circle_visible` uses `circle_descendants_or_self` (a recursive CTE). See [[Row Level Security]].

## One circle per tree

A person can be a direct member of **at most one circle per tree** (all circles that share the same root). They can still be in circles of several trees, for example Grandparents under Family and Neighbours under Friends.

- A trigger on `circles_access` (`circles_access_check_tree`) raises `circle_membership_same_tree`. A trigger on `circles` raises `circle_membership_conflict` when moving a circle would put someone twice in the merged tree. Both take the same per-baby lock, so concurrent writes can't race.
- The server maps these to translated errors (`serverErrors.circleMembershipSameTree`, `circleMembershipConflict`).
- `moveCircleMember` moves a member to another circle of the same tree with one `UPDATE`, admin-only.

## Admin UI

See [[Admin console]]. The "Sharing circles" card shows the tree with member and audience counts. A person included through a sub-circle appears as a dashed "via Grandparents" chip. The "Add a member" list puts people who are already in another circle of this tree in their own group, and picking one moves them. "Move to..." lists only valid parents, blocks the move when it would put someone in two circles and, otherwise, shows who gains and loses access before confirming.

**Moving a circle changes access to existing content immediately, in both directions, and nobody is notified.**

## Audience pickers

`CirclePicker` replaces the inline selects in the post, story, event, anecdote, album and broadcast forms. Sub-circles of a ticked circle show as "included".

## MCP

`list_circles` returns `parentId` for each circle. Sharing an event or anecdote with a circle also shares it with its sub-circles ([[MCP server]]).
