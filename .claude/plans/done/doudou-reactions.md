# Réactions Doudou (custom emoji reactions)

## Status: implemented

Shipped in `e1764da` (5-emoji `ReactionPicker` replacing the heart button),
with follow-up polish in `9a043f7` (per-emoji breakdown with reactor names),
`a52b074` (nickname over first/last name), and `038bf96` (truncated name
lists in popovers). No deviations from the plan below.

Replace the single hardcoded ❤️ "like" button on posts with a picker of 5
baby-themed emojis: 🍼 Biberon, 👶 Bébé, 😴 Dodo, 🎉 Célébration, ❤️ Cœur.

## Scope decisions (confirmed with user)

- One reaction per user per post, same as today (picking a new emoji swaps
  the previous one). No DB migration needed — `post_reactions` already has a
  unique `(post_id, user_id)` constraint and `emoji` accepts any string.
- Fixed set of 5 emojis shown together in a popover (no quick-tap-heart +
  expand split).
- Posts only for now — `events`/milestones have no reactions today and are
  out of scope for this change.

## Existing infra (reused as-is)

- `post_reactions` table (migration `20260721200201_create_posts.sql`):
  `post_id`, `user_id`, `emoji varchar default '❤️'`, unique on
  `(post_id, user_id)`.
- `src/utils/actions/reactions.ts`: `addReaction(postId, babyId, emoji)`
  (upsert), `removeReaction(postId, babyId)`, `getReactions(postId)`.

## Changes

1. `src/utils/reactions.ts` (new): exports `REACTIONS` — the ordered list of
   `{ emoji, label }` for Biberon/Câlin/Dodo/Étape/Cœur. Single source of
   truth for the picker.

2. `src/utils/actions/reactions.ts`: `getReactions` also returns `myEmoji:
   string | null` (which emoji, if any, the current user picked) instead of
   just the boolean `reactedByMe`, so the UI can highlight the right emoji
   and render it as the trigger icon.

3. `src/app/baby/[babyId]/feed/_components/reaction_picker.tsx` (new):
   client component that owns all reaction state (fetch on mount, optimistic
   update, error rollback — same pattern as the current `toggleReaction` in
   `post_card.tsx`). Renders:
   - A trigger button showing the user's chosen emoji (or a neutral
     `SmilePlus` outline icon if they haven't reacted) plus the total
     reaction count, opening a `Popover`.
   - Popover content: the 5 `REACTIONS` emojis as buttons; clicking the
     currently-selected one removes the reaction, clicking another one
     swaps to it.

4. `src/app/baby/[babyId]/feed/_components/post_card.tsx`: remove the
   inlined `reactions`/`reacting`/`toggleReaction` state and the hardcoded
   heart `<button>`; replace with `<ReactionPicker postId={post.id}
   babyId={babyId} />`. Drop the now-unused `Heart` import and
   `addReaction`/`removeReaction`/`getReactions` imports (moved into the new
   component).

## Out of scope / not doing

- No DB migration (single-reaction-per-user constraint is kept).
- No "who reacted with what" breakdown row — matches today's minimal
  count-only display, just swaps the icon set.
- No reactions on `events`/milestones.
