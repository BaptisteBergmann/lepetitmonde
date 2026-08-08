# Anecdotes page — plan

## Status: implemented

Shipped as planned: `anecdotes`/`anecdotes_circles` tables, `new_anecdote`
notification type, `anecdotes.ts` server actions, `PAGE_REGISTRY` entry, and
the `anecdotes/page.tsx` + `anecdotes_view.tsx`/`anecdote_card.tsx`/
`create_anecdote_modal.tsx`/`edit_anecdote_modal.tsx` components. Migration
pushed and `database.types.ts` regenerated against the live database;
typecheck and lint both pass. Confirmed via the live dev server's own logs
(hot-reloaded into an already-open authenticated session) that
`PageSelector` picks up the new `anecdotes` entry with zero server errors.

Deviations from the original plan:
- **`src/utils/notification-types.ts` needed a new entry too** — not called
  out in the original file list. `NOTIFICATION_LABELS` is a
  `Record<Enums<'notification_type'>, string>`, so TypeScript's exhaustiveness
  check on that type caught the miss immediately (`tsc --noEmit` failed until
  `new_anecdote: 'Nouvelles anecdotes'` was added). This drives the
  notification-preferences UI, so it needs a label for every enum value.
- **Follow-up request mid-build**: all pages except Journal (`feed`) and
  Pronostics (`guess`) were switched to `defaultEnabled: false` in
  `page_registry.ts` — Calendrier, Anecdotes, Inventaire, and Liste d'achats.
  This only changes the default for babies with no existing `page_settings`
  override row; babies that already had an explicit admin toggle for one of
  these pages (e.g. `inventory` was already on for the live test baby) keep
  that override untouched.
- No manual click-through of the create/edit/delete flow against the live
  backend — the running dev server is the user's own authenticated session
  against real family data, and driving it automatically would have written
  test anecdotes/photos into that real journal. Verified structurally
  (typecheck, lint, live hot-reload with no server errors) instead; the
  create/edit/delete flow itself should get a manual pass from the user.

## Context

Feature request: a dedicated page for the funny/sweet moments — things the
kid *did* or *said* — as short text entries an admin logs, distinct from the
photo/video feed. Think of it as the family's running "kids say the
darndest things" book: quick to log ("Il a dit : 'les nuages c'est du
coton du ciel'"), quick to browse later.

This is a **new top-level page**, not a post variant folded into the feed —
matching how `guess` (Pronostics) already exists as its own nav entry rather
than living inside the feed. It reuses this app's established patterns
end-to-end:
- `PAGE_REGISTRY` (`src/utils/page_registry.ts`) as the single source of
  truth for nav entry, default role/enabled, and `page_settings` admin
  toggle — no other file needs manual wiring per its own header comment.
- Per-baby Storage bucket + `useSupabaseUpload`/`<Dropzone>` for the
  optional photo, same as posts/stories.
- The `posts_circles` visibility pattern (no circle = hidden, admin-only).
- `notifyUsers` for the "new anecdote" push notification.
- Cursor pagination (`getPosts`'s `limit`/`before` shape) for the list.
- **No RLS in this app** — all authorization is in Server Actions
  (`assertIsAdmin`, manual circle filtering), same as everywhere else.

**Scope kept deliberately small, following the precedent set by `stories`**
(see `.claude/plans/done/stories.md`, "No comments or reactions... matches
the feed's own v1 restraint"):
- Admin-only creation (this app's whole model is admins broadcasting to
  family/friends circles, not user-generated content from viewers).
- No comments or reactions in v1 — comments/reactions tables are hard-FK'd
  to `posts.id` (`post_comments.post_id`, `post_reactions.post_id`), not
  generic/polymorphic, so reusing them would mean either shoehorning
  anecdotes into the `posts` table or building a parallel
  `anecdote_comments`/`anecdote_reactions` pair. Not worth it for v1 — easy
  to add later if the family wants to react to a cute quote.
- One optional photo, attached only at creation (immutable after, like a
  story's media) — not a gallery, not editable post-hoc. Keeps the create
  flow to a single two-step call (`createAnecdote` + optional
  `attachAnecdotePhoto`) instead of a photo-diffing edit flow.
- No categorization (quote vs. action) — a single free-text `content`
  field covers both "il a dit..." and "il a fait...". A future filter/tag
  could be layered on without a schema change if it turns out to matter.

## Naming

Page id `anecdotes`, nav label **"Anecdotes"** (reads naturally in French
for both quotes and funny moments). Icon: `Sparkles` from `lucide-react`
(covers "said something funny" and "did something cute" equally — a quote
icon like `MessageSquareQuote` would over-index on the "said" half).

## Data model

New migration (`mise run db_migration_new create_anecdotes`), styled like
the most recent migrations (`20260808120000_create_stories.sql`):

```sql
CREATE TABLE "public"."anecdotes" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "baby_id" uuid NOT NULL REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  "created_by" uuid DEFAULT auth.uid() REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "content" character varying NOT NULL,
  "happened_at" timestamptz DEFAULT now() NOT NULL,  -- editable "when it happened", defaults to today like posts.taken_at
  "photo_path" character varying,                     -- "anecdotes/<id>/<filename>" within the baby's bucket, nullable
  "photo_thumbnail_path" character varying,            -- video not supported here, but keep column for consistency if that changes
  "photo_mime_type" character varying
);

GRANT ALL ON TABLE "public"."anecdotes" TO "anon";
GRANT ALL ON TABLE "public"."anecdotes" TO "authenticated";
GRANT ALL ON TABLE "public"."anecdotes" TO "service_role";

-- Same "no circle = hidden, admin-only" rule as posts_circles/stories_circles.
CREATE TABLE "public"."anecdotes_circles" (
  "anecdote_id" uuid NOT NULL REFERENCES "public"."anecdotes"("id") ON DELETE CASCADE,
  "circle_id" uuid NOT NULL REFERENCES "public"."circles"("id") ON DELETE CASCADE,
  PRIMARY KEY ("anecdote_id", "circle_id")
);

GRANT ALL ON TABLE "public"."anecdotes_circles" TO "anon";
GRANT ALL ON TABLE "public"."anecdotes_circles" TO "authenticated";
GRANT ALL ON TABLE "public"."anecdotes_circles" TO "service_role";

ALTER TYPE "public"."notification_type" ADD VALUE 'new_anecdote';
```

`page_settings.page_id` is plain `text` (not a DB enum — confirmed in
`20260804182853_create_page_settings.sql`), so no migration needed there;
adding `'anecdotes'` to the `PageId` TS union is enough.

## Server actions — new file `src/utils/actions/anecdotes.ts`

Follow the exact template used in `posts.ts`/`stories.ts`: `'use server'`,
`createClient()`, `contextLogger = logger.child({ function: fn.name, ...ids })`,
`assertIsAdmin` for writes, `revalidatePath('/baby/${babyId}/anecdotes')`
after mutations.

```ts
export type AnecdoteWithDetails = Tables<'anecdotes'> & {
  circle_ids: string[]
  photoUrl: string | null
  photoThumbnailUrl: string | null
}
```

- `createAnecdote({ id, baby_id, content, happened_at }, circleIds)` —
  `assertIsAdmin`, `ensureBabyBucket`, insert into `anecdotes`, insert
  `anecdotes_circles`, then `notifyUsers(babyId, 'new_anecdote', { title:
  'Nouvelle anecdote', body: content.slice(0, 120), url:
  '/baby/${babyId}/anecdotes' }, recipients)` using `getVisibleUserIds`
  (same call shape as `createPost`).
- `attachAnecdotePhoto(anecdoteId, babyId, { filename, mimeType })` —
  `assertIsAdmin`, single `UPDATE anecdotes SET photo_path, photo_mime_type
  WHERE id = anecdoteId` (image only — no video thumbnail step needed).
- `updateAnecdote(anecdoteId, babyId, { content, happened_at }, circleIds)`
  — `assertIsAdmin`, update the row, delete + reinsert
  `anecdotes_circles` (identical diff pattern to `updatePost`). Does not
  touch the photo.
- `getAnecdotes(babyId, { limit, before }: { limit: number; before?: {
  happenedAt: string; createdAt: string } })` — same `withVisibility` +
  cursor-pagination shape as `getPosts` (`.or(...)` on
  `happened_at`/`created_at`), ordered `happened_at desc, created_at desc`.
  No `attachInteractionData` equivalent needed (no comments/reactions/poll/
  views in v1).
- `deleteAnecdote(anecdoteId, babyId)` — `assertIsAdmin`, remove the photo
  storage object if `photo_path` is set (`removeStorageObjects`), delete
  the row (`anecdotes_circles` cascades), `revalidatePath`.

## Pages & components

- **`src/app/baby/[babyId]/anecdotes/page.tsx`** (server): `await
  assertPageAccess(babyId, 'anecdotes')`, then `getUserAccess` +
  `getAnecdotes(babyId, { limit: 20 })`, passed into a client
  `anecdotes_view.tsx` — mirrors `guess/page.tsx`'s
  header-hero-then-list layout (`Reveal`, gradient blob, eyebrow text)
  rather than the feed's infinite-scroll chrome, since this page has a
  simpler single-list shape.
- **`anecdotes_view.tsx`** (client): renders the list of
  `anecdote_card.tsx`, a "Charger plus" button using the same
  cursor-pagination approach as the feed (fetch next page with `before` =
  last item's `happened_at`/`created_at`), and — admin only — a floating
  "+" button opening `create_anecdote_modal.tsx`.
- **`anecdote_card.tsx`**: date badge (`format(happened_at, 'd MMMM yyyy',
  { locale: fr })`), `content` rendered as a large italic quote-styled
  block, optional photo below (reuses the same
  `/api/storage/[babyId]/[...path]` URL construction as
  `toPostWithDetails`), admin-only edit/delete affordance (three-dot menu,
  same `DropdownMenu` pattern as `post_card.tsx`).
- **`create_anecdote_modal.tsx`**: trimmed-down `create_post_modal.tsx` —
  `content` textarea (required, autofocus), `happened_at` date input
  (defaults to today, same `format(new Date(), 'yyyy-MM-dd')` pattern),
  optional single-file `<Dropzone>` (`maxFiles: 1`, `image/*` only — no
  video, since an anecdote's photo is illustrative not the point), and the
  same circle `<Select>` as posts/stories. On confirm: `createAnecdote`
  then, if a file was uploaded, `attachAnecdotePhoto`.
- **`edit_anecdote_modal.tsx`**: `content` + `happened_at` + circles only
  (no photo field, per the "photo immutable after creation" scope call
  above).

## PAGE_REGISTRY entry (`src/utils/page_registry.ts`)

```ts
export type PageId = 'feed' | 'calendar' | 'guess' | 'anecdotes' | 'inventory' | 'buy-list' | 'admin'

{
  id: 'anecdotes',
  name: 'Anecdotes',
  eyebrow: 'Page — Ce qu\'il a dit, ce qu\'il a fait',
  description: 'Les petites phrases et moments rigolos du quotidien, à garder pour toujours.',
  icon: Sparkles,
  defaultRole: 'viewer',
  defaultEnabled: true,
  manageable: true,
},
```

Inserted after `guess` and before `inventory` in the array (nav order).

## Files touched

| File | Change |
|---|---|
| `supabase/migrations/<ts>_create_anecdotes.sql` | new — `anecdotes`, `anecdotes_circles`, `new_anecdote` enum value |
| `src/utils/actions/anecdotes.ts` | new — `createAnecdote`, `attachAnecdotePhoto`, `updateAnecdote`, `getAnecdotes`, `deleteAnecdote` |
| `src/utils/page_registry.ts` | add `'anecdotes'` to `PageId`, new registry entry |
| `src/app/baby/[babyId]/anecdotes/page.tsx` | new |
| `src/app/baby/[babyId]/anecdotes/_components/anecdotes_view.tsx` | new |
| `src/app/baby/[babyId]/anecdotes/_components/anecdote_card.tsx` | new |
| `src/app/baby/[babyId]/anecdotes/_components/create_anecdote_modal.tsx` | new |
| `src/app/baby/[babyId]/anecdotes/_components/edit_anecdote_modal.tsx` | new |
| `src/utils/supabase/database.types.ts` | regenerated via `mise run update_types` (never hand-edited) |

No changes needed to `access.ts`, `circles.ts`, `notify.ts`'s dispatch
logic, `mobile_menu.tsx`, or the feed at all — `PAGE_REGISTRY` alone drives
nav, the landing page's `SECTIONS`, and the admin page-settings toggle.

## Verification

No automated test suite in this repo — verify via typecheck/lint + manual
pass (per this app's established convention):

1. `mise run db_migration_new create_anecdotes`, fill in the SQL above,
   `mise run db_push`, then `mise run update_types`.
2. `pnpm run typecheck` and `pnpm run lint`.
3. Manual test in the running dev server (use the `run` skill):
   - As admin, confirm "Anecdotes" appears in the nav (desktop header +
     mobile menu) without any manual wiring beyond `PAGE_REGISTRY`.
   - Create a text-only anecdote, no circle selected — confirm it's
     admin-only visible and shows up newest-first.
   - Create one with a photo and a circle — confirm a member of that
     circle sees it (with photo) and a member of a different circle
     doesn't.
   - Edit an anecdote's text/date/circles — confirm the photo is
     untouched and unaffected.
   - Delete an anecdote with a photo — confirm the storage object is
     removed (check the bucket) and the row disappears.
   - Confirm the "new_anecdote" push notification fires and respects
     per-type opt-out/quiet hours, same as `new_post`/`new_story`.
   - As a non-admin viewer, confirm there's no create/edit/delete
     affordance, just the read-only list.
   - In Admin → page settings, confirm "Anecdotes" can be disabled or its
     required role changed, same as any other page.
