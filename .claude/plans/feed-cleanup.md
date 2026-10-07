# Feed cleanup: reaction pills, server-only, validation, retries, polish

Status: approved (steps 1–13; step 13 design questions resolved with defaults: trigger always shows SmilePlus, no "You" marker, no hover tooltip)
Approved by: Baptiste (2026-10-07, user asked to plan, build and review the open items directly; open questions resolved with the plan defaults)

Scope requested by the user on 2026-10-07 (plan, build and review directly). It collects the open follow-ups from `done/journal-review-fixes.md`, `done/feed-followups.md` and `done/journal-ui-polish.md`.

## Goal
Close the open feed follow-ups for the family members using the journal. Tapping a reaction pill should react with that emoji. Server-only modules can't end up in client bundles or be called as actions. Uploads and bug reports validate their inputs. Retries after a lost response don't fail. A few small hydration, accessibility and copy issues get fixed.

## Out of scope
- RLS (separate plan: `.claude/plans/rls.md`).
- Idempotency of `attachPostPhotos` and `publishPost` after a lost response. See Risks.
- Validating the client-supplied `mimeType` in the attach actions.
- Other French typography (58 lines use an ordinary space before `? ! : ;`). Only « » is in scope.
- Time zone handling outside `comment_list.tsx` (`buy_list.tsx`, `display_bug_reports.tsx`).
- Unhandled `onChanged()` rejections outside the reaction pickers (`comment_list.tsx` lines ~75/90, `story_viewer.tsx` lines ~314/333/356).

## Verification of the requested items (done against the code on 2026-10-07)
Every item is still open. Corrections to the brief:
- **Item 6 (createPoll):** `polls` has `UNIQUE(post_id)` (`20260723190838_create_polls.sql`). A lost-response retry can't create a second poll. It fails with a unique violation (23505), so the modal shows `pollCreateError` and the user is stuck. The fix is the same either way.
- **Item 9 (dates):** `post_card.tsx` only formats `post.taken_at`. That column is a Postgres `date`, and `parseISO('YYYY-MM-DD')` gives local midnight on both server and client, so it can't mismatch. Only `comment_list.tsx` is affected (`created_at` is `timestamptz`, formatted with `HH:mm` and `isThisYear`). In practice it **does** mismatch today: the Docker container runs in UTC and the family's browsers run in Europe/Paris.
- **Item 11 (push title):** there is no per-user locale. The locale is deployment-wide (`DEFAULT_LOCALE`, `src/i18n/config.ts` `resolveLocale()`). `common.appName` is "Le petit monde" in both locales, so the visible output doesn't change. The step only removes the hard-coded string.
- **Item 12 (« »):** there are 5 strings, not 6: `fr.json` lines 326, 386, 549, 988, 989. The 2 newer strings (lines 344, 378) use U+00A0, so that is the convention to follow.
- **Item 5 (paths):** the same unchecked `filename` pattern exists in `albums.ts` (~line 97), `anecdotes.ts` `attachAnecdotePhoto` (~line 89) and `stories.ts` `createStory` (~line 64). Those are included.
- **Item 3:** more modules hold secrets or are server-only: `supabase/auth.ts`, `supabase/realtime-relay.ts` (service role), `webpush.ts` (VAPID private key), `email.ts` (Resend key), `actions/errors.ts`, `changelog.ts` (fs). The client only imports `realtime-relay` and `changelog` with `import type`, which is erased at compile time, so both are safe to mark.

## Current state
- Reaction pickers: `src/app/baby/[babyId]/feed/_components/reaction_picker.tsx` (post), `story_reaction_picker.tsx` and `comment_reaction_picker.tsx` are near-identical. Each has a Popover emoji picker (`pick(emoji)` toggles: same emoji removes, another emoji switches, one reaction per user) plus `*ReactionPill` components. Each pill is a Popover that shows `formatNamesPreview(names)`. The post picker keeps `useState(initialReactions)` with no resync, and `post_card.tsx:273` passes `post.reactions`. The story and comment pickers resync with the "adjust state during render" pattern and call `onChanged()` un-awaited. Those callbacks are async (`post_card.tsx` `loadComments`, `story_tray.tsx` `refresh`), so a rejection goes unhandled.
- `src/utils/supabase/server.ts` line 1 is `"use server"`, which makes `createClient` a callable action. 40 files import it, all server code. No client component imports it.
- `server-only` is not installed. `access.ts`, `storage.ts`, `notify.ts`, `albums-internal.ts`, `feed-access.ts` and `feed-loaders.ts` only carry a "Deliberately NOT a 'use server' module" comment.
- `src/utils/actions/bug_reports.ts` `submitBugReport` uploads `formData.get('screenshot') as File` with `contentType: 'image/png'` and checks neither type nor size. The client (`src/components/bug_report_button.tsx`) sends a PNG from html2canvas. The Next server-action body limit is the default 1 MB (`next.config.ts` doesn't set one).
- `src/utils/actions/posts.ts` `attachPostPhotos` builds `posts/${postId}/${filename}` from client input. `src/utils/storage-path.ts` `hasUnsafePathSegment` already exists and is used by `/api/upload` and `/api/storage`. Filenames come back from `/api/upload` as one path segment: `uploadPath.split('/').pop()`.
- `createPost` (posts.ts:38) inserts with the client-generated `postId` (`create_post_modal.tsx:43`) and rolls back if the circles insert fails. `createPoll` (polls.ts:23) inserts and rolls back if the options insert fails. `updatePoll` already refuses to edit a poll that has votes and rewrites the question and options.
- `src/components/dropzone.tsx` has a `disabled` prop that blocks drops, disables the input and hides the remove buttons. The root still gets `tabIndex: 0` from react-dropzone's `getRootProps`. In react-dropzone v15, `rest` is spread last, so an explicit `tabIndex: -1` overrides it. `useDropzone` is called inside `src/utils/actions/use-supabase-upload.ts` with `noClick: true`. The post and story modals pass `disabled={isPending}`. `add_photos_modal.tsx:82`, `create_album_modal.tsx:119` and `create_anecdote_modal.tsx:111` don't, though each has `isPending`.
- `create_post_modal.tsx:227-246` uses fixed `id="caption"` and `id="taken_at"`, while `edit_post_modal.tsx` already uses `useId`. `create_story_modal.tsx` (`story-caption`, `story-group`) and `edit_story_modal.tsx` (`story-edit-caption`, `story-edit-group`) have the same issue.
- `src/utils/actions/notifications.ts:345` sends `title: 'Le petit monde'`.

CLAUDE.md drift (unchanged, noted only): Server Actions live in `src/utils/actions/`, there is no `@/utils/supabase/client`, and only `NEXT_PUBLIC_COMMIT_SHA` is a build arg.

## Approach
Small, independent commits in risk order: security first, then robustness, then copy, and the designed reaction-pill change last. Reuse what's there: `hasUnsafePathSegment` for paths, `actionError` for errors, `updatePoll` for the poll retry, and the "adjust state during render" resync pattern from `story_reaction_picker.tsx`. For dates, render in a fixed family time zone (`Europe/Paris`, already hard-coded in `notify.ts`) during SSR and hydration, then switch to the browser's time zone after hydration via `useSyncExternalStore`. That way the server and client always agree, and someone abroad still sees their local time. Use `Intl.DateTimeFormat`, which needs no new dependency. Alternatives I rejected: `@date-fns/tz` (adds a dependency), a client-only render (time text pops in after load), and `suppressHydrationWarning` (hides the bug and still shows the wrong time zone until a re-render).

For the reaction pills, refactor the three duplicated pickers into one shared `reaction_bar.tsx` with a style variant, so tap-to-react and "who reacted" are built once. The designer decides how "who reacted" stays reachable. The default proposal is in `## Design`.

## Data and migrations
- None. No schema, RLS or storage changes. `database.types.ts` stays as is.
- New dependency: `server-only` (pnpm, runtime `dependencies`). `pnpm-lock.yaml` must be committed because CI and Docker run `--frozen-lockfile`.

## Access and security
- No new routes, actions or queries. The reaction pills call the existing `addReaction`/`removeReaction`, `addStoryReaction`/`removeStoryReaction` and `addCommentReaction`/`removeCommentReaction`, which already check membership and visibility. "Who reacted" reuses the `names` already returned in `ReactionsData.breakdown`.
- Removing `"use server"` from `supabase/server.ts` removes a public action endpoint (it only returned an anon-key client bound to the caller's cookies, so it was low impact).
- `import 'server-only'` turns any accidental client import of the admin, service-role, VAPID or Resend modules into a build error.
- `createPost` idempotent path: it treats an existing row as success only when `baby_id` matches **and** `created_by === user.id` (from `getAuthUser()`), after the existing `assertIsAdmin` and `assertCirclesInBaby`. Any other existing row rethrows the original error, so a caller can't hijack or probe someone else's post id beyond what the duplicate error already revealed.
- `createPoll` idempotent path: it runs after the existing `assertPostVisible(…, assertAdmin(babyId))` and delegates to `updatePoll`, which repeats the admin and visibility checks and refuses polls that have votes.
- Path validation: the attach actions reject any `filename` or `thumbnailFilename` that `hasUnsafePathSegment([name])` flags, before any write. Admins can then only point rows at objects inside their own post, album, anecdote or story folder.
- Bug report: the screenshot must be a `File`, ≤ 1 MB, with `type === 'image/png'` **and** PNG magic bytes. Otherwise the action throws. The upload uses the service role, as it does today, into the private bug-reports bucket.
- No service-role usage is added.

## Steps
Run `pnpm typecheck && pnpm lint` before each commit. Make one Conventional Commit per step, followed by its `CHANGELOG.md` commit (per CLAUDE.md).

1. **fix(security): drop "use server" from the Supabase server client.** Remove line 1 of `src/utils/supabase/server.ts`. Before committing, grep for importers and confirm none is a `'use client'` file (checked: none). Files: `src/utils/supabase/server.ts`.

2. **build: add server-only and mark server modules.** Run `pnpm add server-only` and add `import 'server-only'` as the first import in each module below. Where a module has the "Deliberately NOT a 'use server' module" comment, keep the comment and put the import just after it.
   - `src/utils/supabase/server.ts`, `admin.ts`, `auth.ts`, `realtime-relay.ts`
   - `src/utils/actions/access.ts`, `storage.ts`, `notify.ts`, `errors.ts`
   - `src/utils/albums-internal.ts`, `feed-access.ts`, `feed-loaders.ts`, `webpush.ts`, `email.ts`, `changelog.ts`

   Don't add it to `'use server'` files or `src/utils/supabase/middleware.ts` (proxy). Then run `pnpm build` locally (through `mise exec -- pnpm build` if env is needed; never `docker build`). It must pass with no "You're importing a component that needs server-only" error. CI only runs typecheck and lint before the Docker build, so the local `pnpm build` is the only early check. If the build flags a module, fix the client-side import (for example switch to `import type`) rather than dropping the marker. Files: `package.json`, `pnpm-lock.yaml`, the modules above.

3. **fix(security): reject unsafe filenames in attach actions.** Add `async function assertSafeFilename(name: string | undefined)`. It throws `actionError('invalidFilename')` when `name !== undefined && hasUnsafePathSegment([name])`. Put it in `src/utils/storage-path.ts`, or in `src/utils/actions/errors.ts` if storage-path must stay sync and next-intl-free. The preferred split: keep `storage-path.ts` pure, and have each action call `if (hasUnsafePathSegment([...])) throw await actionError('invalidFilename')`. Apply it to every `filename` and `thumbnailFilename`, before any DB write and after the auth check, in:
   - `posts.ts` `attachPostPhotos`
   - `albums.ts` (the function that builds `${folder}/${filename}`, ~line 97)
   - `anecdotes.ts` `attachAnecdotePhoto`
   - `stories.ts` `createStory` (`mediaFilename` / `thumbnailFilename`)

   Add `serverErrors.invalidFilename` (see Translations). Files: those four actions, `messages/en.json`, `messages/fr.json`.

4. **fix(security): validate bug report screenshots.** In `submitBugReport`:
   - Read `formData.get('screenshot')`.
   - If it's present and not a `File`, or `size > MAX_SCREENSHOT_BYTES` (1 MB, a module constant with a comment that it matches the default server-action body limit), or `type !== 'image/png'`, or the first 8 bytes aren't `89 50 4E 47 0D 0A 1A 0A`, then `contextLogger.warn` and throw `actionError('invalidScreenshot')`.
   - Do this **before** `ensureBugReportsBucket`.
   - Keep `contentType: 'image/png'`, which is now true.

   Files: `src/utils/actions/bug_reports.ts`, messages.

5. **fix(feed): make createPost retry-safe after a lost response.** In `createPost`:
   - Get `user` from `getAuthUser()` (already imported).
   - On a post insert error with `code === '23505'`, select `id, baby_id, created_by` from `posts` with `eq('id', post.id)`, using `maybeSingle()`.
   - If the row exists, `baby_id === post.baby_id` and `created_by === user.id`, it's the caller's own retry. Update `caption` and `taken_at` to the retried values, because fields are editable again after a failure. Bring `posts_circles` in line with `circleIds`: delete rows for this post not in the list, then `upsert(..., { onConflict: 'post_id,circle_id', ignoreDuplicates: true })`. Log `info` "Post already existed (retry)" and return the id. This also covers a rollback that failed earlier.
   - Otherwise rethrow the original error.

   Files: `src/utils/actions/posts.ts`.

6. **fix(feed): make createPoll retry-safe after a lost response.** In `createPoll`, on a poll insert error with `code === '23505'`:
   - Select `id` from `polls` with `eq('post_id', postId)`, using `maybeSingle()`.
   - If it exists, `return updatePoll(existing.id, postId, babyId, question, options)`. That rewrites the content to what the user just submitted (a no-op if it's identical), keeps the auth checks, and throws `cannotEditVotedPoll` if anyone voted.
   - Otherwise rethrow.

   Add a comment explaining the lost-response case. Files: `src/utils/actions/polls.ts`.

7. **fix(ui): disable the Dropzone while uploading everywhere and drop it from the tab order.**
   - In `src/components/dropzone.tsx`, extend the existing `...(disabled && { ... })` spread in `getRootProps` with `tabIndex: -1`. It must be a conditional spread: passing `tabIndex: undefined` would override react-dropzone's `0` with nothing.
   - Make the "select files" control in `DropzoneEmptyState` (~line 224) non-tabbable when disabled too: `tabIndex={disabled ? -1 : undefined}`, keeping `aria-disabled`.
   - Pass `disabled={isPending}` in `add_photos_modal.tsx`, `create_album_modal.tsx` and `create_anecdote_modal.tsx`.

   Files: those four.

8. **fix(feed): resync the post reaction picker and catch refetch failures.**
   - `reaction_picker.tsx`: add the `prevInitialReactions` "adjust during render" resync, copied from `story_reaction_picker.tsx` with the same comment.
   - `story_reaction_picker.tsx` and `comment_reaction_picker.tsx`: type `onChanged: () => void | Promise<void>` and replace the bare `onChanged()` with `try { await onChanged() } catch (err) { contextLogger.warn({ err }, 'Error refetching after reaction') }`. A failed refetch only means stale data, so no toast and no rollback. Widen the prop type in `story_viewer.tsx` (`onChanged` prop) and `comment_list.tsx` to match.

   Files: the three pickers, `story_viewer.tsx`, `comment_list.tsx`.

9. **fix(feed): format comment times in a hydration-safe time zone.**
   - In `src/utils/formatting.ts` (already client-safe), add `export const FAMILY_TIME_ZONE = 'Europe/Paris'`.
   - Add a helper that uses `Intl.DateTimeFormat(getLocaleTag(locale), { timeZone })`:
     - date: `{ day: 'numeric', month: 'short' }`, plus `year: 'numeric'` when the year differs from the current year *in that time zone*
     - time: `{ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }`

     For example: `formatDateAtTimeParts(iso: string, locale: Locale, timeZone: string): { date: string; time: string }`.
   - Add `src/utils/hooks/use-display-time-zone.ts`:
     `useSyncExternalStore(() => () => {}, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => FAMILY_TIME_ZONE)`
     During SSR and hydration React uses the server snapshot, then re-renders with the browser's time zone, with no hydration error.
   - Use both in `comment_list.tsx` in place of the `date-fns` `format`/`isThisYear` calls, and drop the unused imports.
   - Optionally switch `notify.ts` `currentTimeInParis` to the constant.

   No change to `post_card.tsx` (see Verification). Files: `src/utils/formatting.ts`, the new hook, `comment_list.tsx`, optionally `notify.ts`.

10. **fix(a11y): use useId for the post and story form field ids.**
    - `create_post_modal.tsx`: `captionId`/`takenAtId` via `useId()`, mirroring `edit_post_modal.tsx`.
    - `create_story_modal.tsx` and `edit_story_modal.tsx`: same for caption/group, including any `list=`/datalist id tied to the group field.

    Files: those three.

11. **fix(notifications): translate the test-push title.** In `notifications.ts` `sendNotification`, set `title: (await getTranslations('common'))('appName')`. It uses the deployment locale, which is the only locale the app has. The service-worker fallback in `src/worker/index.ts` stays hard-coded because it has no i18n. Files: `src/utils/actions/notifications.ts`.

12. **fix(i18n): use non-breaking spaces inside French guillemets.** Replace the ordinary spaces after « and before » with U+00A0 on `fr.json` lines 326, 386, 549, 988 (both pairs, inside the `<highlight>` tags) and 989 (both pairs). Check that the file is still valid JSON and that `grep -n "« \| »" messages/fr.json` comes back empty. Files: `messages/fr.json`.

13. **feat(feed): tap a reaction pill to react (designer-dependent).**
    - Create `src/app/baby/[babyId]/feed/_components/reaction_bar.tsx` (client), holding the shared picker trigger, pills and "who reacted" affordance. Props:
      - `reactions: ReactionsData`
      - `onPick(emoji): void`
      - `variant: 'card' | 'comment' | 'dark'`, covering today's three style sets (post card, comment, story viewer)
    - Each picker keeps its own state, resync, `inFlight` guard and actions, and renders `<ReactionBar>`.
    - Pill tap calls the existing `pick(emoji)`. If `emoji === myEmoji` it removes your reaction, otherwise it adds or switches to that emoji.
    - Pills become `<button type="button" aria-pressed={emoji === myEmoji}>` with the new `aria-label` (see Translations), and get a visible "mine" state per Design.
    - "Who reacted" follows `## Design`.
    - In the story viewer, check that tapping a pill doesn't hit the prev/next tap zones or toggle pause. If it does, call `stopPropagation` on the bar the way the existing picker trigger does.
    - Delete the three `*ReactionPill` components.

    This can be split into 13a (extract `ReactionBar` with no behavior change) and 13b (tap-to-react plus who-reacted) if the diff gets large. Files: the new component, the three pickers, messages.

## Translations
- `serverErrors.invalidFilename` (step 3): en "Invalid file name." / fr "Nom de fichier invalide."
- `serverErrors.invalidScreenshot` (step 4): en "The screenshot must be a PNG image under 1 MB." / fr "La capture d'écran doit être une image PNG de moins de 1 Mo."
- Step 13, final wording per Design:
  - `reactions.pillLabel` changes meaning: en "React with {emoji} ({count})" / fr "Réagir avec {emoji} ({count})".
  - New `reactions.pillLabelMine`: en "Remove your {emoji} reaction ({count})" / fr "Retirer votre réaction {emoji} ({count})".
  - New `reactions.whoReacted`: en "See who reacted" / fr "Voir qui a réagi".
- Step 12 edits existing fr strings only.

## Design
Scope: step 13 only. Every other step has no visual change, apart from the Dropzone simply no longer taking focus while disabled.

**The Copy table below supersedes the step 13 bullets in `## Translations`.** `pillLabelMine` and `whoReacted` are not added. The pill keeps one stable label and `aria-pressed` carries "mine", which is the correct pattern for a toggle button: a label that changes when the button is pressed makes screen readers announce two different controls.

### User flow
1. A reader sees a post, comment or story with reactions: `[☺+] [❤️ 3] [🍼 1]  Marie, Paul…`. Their own reaction's pill is outlined and its count is bold.
2. They tap a pill they haven't used, for example `🍼 1`. That pill becomes "mine" at once (`🍼 2`, outlined). If they had another reaction, its pill loses the outline and its count drops by one, and the pill disappears if the count reaches 0. No toast.
3. They tap their own pill (`🍼 2`). It goes back to the plain style (`🍼 1`), or disappears if they were the only one. Focus moves to the ☺+ trigger when the focused pill disappears.
4. They tap ☺+ to open the existing six-emoji picker. It works as it does today, and the bar closes the picker after a pick.
5. They tap the names text after the pills ("Marie, Paul…"). A popover opens with one row per emoji and the full list of names, for example "❤️  Marie, Paul and Mamie Jo". Tapping outside or pressing Escape closes it.
6. If saving fails, the pills go back to their previous state and the existing `reactions.error` toast shows.

### Screens
#### ReactionBar (`_components/reaction_bar.tsx`, new, `'use client'`)
Wireframe (mobile, post card, 375px):
```
┌───────────────────────────────────────┐
│ ...caption...                         │
│ (☺+) (❤️ 3) [🍼 2] (😂 1)  Marie, Pa… │  ← [ ] = mine: ring + bold count
│                               👁 12   │  ← PostViews (unchanged, right side)
└───────────────────────────────────────┘
```
Comment (small):
```
  Marie · 7 oct. 14:02
  Trop mignon !
  (☺+) [❤️ 2] (😂 1)  Paul, Moi…
```
Story viewer footer (dark):
```
  caption in white…
  (☺+) (❤️ 4) [🍼 1]  Mamie Jo, Paul…
  👁 Vu par Marie, Paul…
```

- **Layout:** the root keeps today's `flex flex-wrap items-center gap-1.5` (comment adds `mt-1`). The order is picker trigger, then pills in `breakdown` order (that's `REACTIONS` order, so pills never jump around when counts change, and a new pill slides into its fixed slot), then the names button. On narrow widths or in French the names button wraps to its own line. Nothing important gets cut, because the full names are always one tap away. Nothing changes at larger widths. On the post card the bar stays the left child of the existing `justify-between` row with `PostViews`.
- **Components:** reuse `Popover`, `PopoverTrigger`, `PopoverContent` and `PopoverTitle` from `src/components/ui/popover.tsx` (Base UI, `z-[70]` built in, so no new z-index). Use `SmilePlus` from lucide, `REACTIONS` from `@utils/reactions` (to look up each emoji's name key) and `formatNamesPreview` from `@utils/users`. The pills are plain `<button type="button">`, not Popover triggers any more. The bar owns `pickerOpen` and closes the picker after `onPick`. Delete `ReactionPill`, `CommentReactionPill` and `StoryReactionPill`.
- **Variant classes.** The shared pill base is `relative touch-target inline-flex items-center rounded-full px-2 cursor-pointer outline-none focus-visible:ring-2 transition-[background-color,transform] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100`. The count is `<span className="text-xs tabular-nums">`, with `font-semibold` added when mine.

| | card (post) | comment | dark (story) |
|---|---|---|---|
| Pill size | `h-7 gap-1`, emoji `text-base` | `h-6 gap-0.5`, emoji `text-sm` | `h-7 gap-1`, emoji `text-base` |
| Pill, not mine | `bg-landing-background text-landing-foreground hover:bg-landing-border focus-visible:ring-ring` | `bg-landing-surface text-landing-foreground hover:bg-landing-border focus-visible:ring-ring` | `bg-white/10 text-white hover:bg-white/20 focus-visible:ring-white/70` |
| Pill, mine | `bg-primary/15 ring-1 ring-inset ring-primary` + bold count | same as card | `bg-white/25 ring-1 ring-inset ring-white` + bold count |
| Trigger | `h-7 w-7`, `SmilePlus h-4 w-4` | `h-7 w-7`, `SmilePlus h-3.5 w-3.5` | `h-7 w-7 bg-white/10 hover:bg-white/20`, `SmilePlus h-4 w-4` |
| Names button | `h-7 text-xs text-landing-muted hover:text-landing-foreground` | `h-6 text-xs text-landing-muted hover:text-landing-foreground` | `h-7 text-xs text-white/70 hover:text-white` |

  The mine focus ring stays `ring-2` on `focus-visible`. It replaces the `ring-1` while focused, which is fine because `aria-pressed` and the bold count still show the state.
- **"Mine" cue (not color-only):** the pill gets an inset outline (a shape and edge change, with at least 3:1 contrast: `primary` against the light and dark `landing-*` surfaces, white against the story's dark backdrop) **and** a semi-bold count. The `aria-pressed` attribute drives it. The selected emoji in the picker popover keeps its existing ring style, so both places look alike.
- **Trigger change:** the ☺+ trigger now **always** shows `SmilePlus` in the neutral colors (`text-landing-muted hover:text-landing-foreground hover:bg-landing-background`; on the comment variant `hover:bg-landing-surface`; on the story variant `text-white/80 hover:text-white`). It no longer shows your emoji in rose. Your reaction is already marked on its pill, so showing it on the trigger too would put the same emoji twice in the row and read as two separate reactions. Keep its `aria-label` as `a11y.react`.
- **Names button ("who reacted"):**
  - Data: `allNames = breakdown.flatMap(b => b.names)` (one reaction per user, so there are no duplicates). The visible text is `formatNamesPreview(allNames, 2)`, for example "Marie, Paul…". Use 2 names rather than the default 3 so it usually fits beside the pills at 375px. Add `max-w-[12rem] truncate` as a safety net (`max-w-[9rem]` on the comment variant).
  - Render it only when `allNames.length > 0`. Right after your optimistic first reaction, `names` is still empty until the refetch, so the button appears a moment later instead of showing an empty label.
  - Classes: `relative touch-target inline-flex items-center rounded-full px-1.5 cursor-pointer underline-offset-2 hover:underline outline-none focus-visible:ring-2` + the variant ring color.
  - It is a `PopoverTrigger`. `PopoverContent align="start" className="w-auto max-w-[min(18rem,calc(100vw-2rem))] gap-2 p-3"` holds:
    - `PopoverTitle className="text-sm font-medium"` showing `reactions.whoReactedTitle`.
    - `<ul className="flex flex-col gap-1.5">`. Each row is `<li className="flex items-start gap-2 text-sm text-popover-foreground">` with `<span role="img" aria-label={t(key)} className="text-base leading-none shrink-0">{emoji}</span>` and the names joined with `Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })` (the same approach as `post_stats_modal.tsx`; `useLocale()` from next-intl). Names wrap normally. Remove `whitespace-nowrap` so long French lists don't overflow.
  - The popover stays the normal light/dark theme surface, even in the story viewer, as it does today.
  - No long-press and no hover tooltip in this step. This is the only path, and it works with touch, mouse and keyboard.
- **Interactions:**
  - A pill tap calls `onPick(emoji)`. The picker's existing `inFlight` guard quietly ignores taps while a save is running, as it does today, so nothing dims.
  - **Focus rescue:** when the pill that had focus disappears (your own pill with count 1), move focus to the trigger. `ReactionBar` keeps a `triggerRef`. In the pill's click handler, if `emoji === myEmoji && count === 1`, call `triggerRef.current?.focus()` after `onPick`. Also do this on rollback? No: on rollback the pill comes back and losing focus there is acceptable.
  - **Story viewer:** the footer is a sibling of the tap-zone `div` (`story_viewer.tsx` ~516–600), not inside it, so pill taps can't reach `handlePointerDown/Up`. No `stopPropagation` is needed. The builder should still check this on a phone. The window `keydown` handler already ignores events from inside `[data-slot="popover-content"]`. ArrowLeft/Right while a pill has focus will change story, which matches how the trigger behaves today.
  - **New pill entrance:** pills are keyed by emoji, so a new pill mounts. Give it `animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none` (tw-animate-css). Counts change instantly with no number animation.

### States
- Loading: none of its own. The bar renders from server data (the feed skeleton already shows a `size-7` trigger placeholder).
- Empty (no reactions): only the ☺+ trigger shows, with no pills and no names button. Same as today.
- Error (save fails): the optimistic state rolls back to the snapshot and the existing `reactions.error` toast shows. The pill's mine outline goes back to where it was.
- Success: the pill change itself is the feedback, with no toast. The names button and popover update after the refetch.
- Offline / slow: the tap applies at once. Further taps are ignored until the request settles. Offline, it rolls back and shows the toast, as above. A slow refetch only leaves names stale for a moment.

### Copy
| Key | English | French |
|-----|---------|--------|
| reactions.pillLabel (changed) | {emoji} {count}, react | {emoji} {count}, réagir |
| reactions.whoReactedLabel (new) | See who reacted: {names} | Voir qui a réagi : {names} |
| reactions.whoReactedTitle (new) | Who reacted | Qui a réagi |

- In fr `whoReactedLabel`, the space before ":" must be U+00A0 (the convention from step 12).
- `{names}` is the same `formatNamesPreview(allNames, 2)` string that is shown on screen, so the accessible name contains the visible text (WCAG 2.5.3).
- `pillLabel` starts with the visible "{emoji} {count}" for the same reason. It is used whether or not the pill is mine, and `aria-pressed` tells screen readers which one is pressed (e.g. "❤️ 3, react, toggle button, pressed").
- Unchanged and reused: `a11y.react`, `reactions.error`, the six reaction names (`reactions.heart` etc., used for `role="img"` in the popover).

### Accessibility
- Pills: `<button type="button" aria-pressed={emoji === myEmoji} aria-label={t('pillLabel', { emoji, count })}>`. The label stays the same whether or not the pill is pressed.
- Names button: `aria-label={t('whoReactedLabel', { names: preview })}`. Base UI gives it `aria-expanded`/`aria-haspopup`. In the popover, Escape closes and focus goes back to the button. In the story viewer, Escape closes only the popover (the existing behavior from journal-ui-polish).
- Focus order: trigger → pills (left to right) → names button. All are native buttons, so Enter and Space work.
- Touch targets: every control keeps `touch-target relative`, so each hit area is at least 44px on coarse pointers. The `gap-1.5` from the earlier polish keeps neighbouring hit areas from overlapping too much. The comment pill (`h-6`) relies on `touch-target` exactly as it does today.
- Contrast: the pill text uses `landing-foreground` or white, unchanged. The mine ring (`primary`, or `white` on the story variant) meets 3:1 for non-text UI in both themes. The names text uses `landing-muted`, which is already used for small text on these surfaces, and `white/70` on story (the same as "seen by").
- Reduced motion: `motion-reduce:` turns off the `active:scale-95` press, the new-pill `animate-in` and the color transitions. The mine state never depends on motion.
- Dark mode: the `card` and `comment` variants use `landing-*` and `primary` tokens, which already flip under `.dark`. The `dark` variant is fixed white-on-photo in both themes, as it is today.

### Questions
- Trigger: OK to drop "your emoji in rose on the ☺+ trigger" now that the pill shows it? (Default: yes, as specified above. It avoids showing the same emoji twice.)
- Should "who reacted" mark yourself, for example as "You" first in the list? That would need the current user's id or name in `ReactionsData`, which is a data change for the planner. Default: no, names show as they do today.
- A hover tooltip with names on desktop pills could come later. It is left out to keep one consistent path.

## Risks and open questions
- **server-only build check:** CI's typecheck and lint don't run `next build` until the Docker job, so a bad import only fails there. The builder must run `pnpm build` locally in step 2 before pushing.
- **Bug report size:** the default 1 MB server-action body limit already rejects larger screenshots before the action runs, with a generic error. A phone screenshot at DPR 2 can exceed that today. Default: leave it as is and only add the explicit check. A follow-up could downscale or JPEG-encode on the client. Raising `serverActions.bodySizeLimit` would affect every action.
- **createPost retry overwrites caption, date and circles with the retried values.** That is intended, since the post isn't published yet and nobody is notified.
- **Still not idempotent:** `attachPostPhotos` after a lost response inserts duplicate `post_photos` and `album_photos` rows, and `publishPost` re-sends pushes. Left as a follow-up. A unique `(post_id, storage_path)` constraint would be the clean fix but needs a migration.
- **English comment dates change from "7 Oct" to "Oct 7"** because of Intl en-US. Default: accept. Alternatively map `en` to `en-GB` for this helper only.
- **Family time zone constant:** fixed to Europe/Paris. Users abroad see their own time zone after hydration, and Paris time only in the brief first paint.
- Reaction pill design is open: see `## Design`.

## How to verify
- Step 1: the app loads, login works, and feed actions work. `grep -n "use server" src/utils/supabase/server.ts` is empty.
- Step 2: `pnpm typecheck && pnpm lint && pnpm build` all pass. Temporarily importing `@utils/supabase/admin` into a `'use client'` component breaks the build (then revert). After the push, the CI Docker build goes green.
- Step 3: as an admin, publish a post with photos, add album photos, an anecdote photo and a story. All work. In DevTools, call the attach action with `filename: '../other/x.jpg'` or `'..'`. It's rejected with "Invalid file name" and no row is inserted.
- Step 4: submit a bug report with and without a screenshot. Both save, and the screenshot shows in admin. Send a crafted request with a JPEG renamed to `.png`, a text file, or a `type: image/png` blob with wrong bytes. Each is rejected, and no bucket object is created.
- Step 5: in the post modal, make `createPost` succeed but drop the response (DevTools "Block request URL" after it lands, or throttle offline right after the request is sent). Retry with "Finish publishing": the post publishes once, with no duplicate-id error. Change the caption before retrying: the new caption is kept. As another admin, call `createPost` with an existing post id: it fails.
- Step 6: same lost-response test with a poll. The retry succeeds and the post has exactly one poll with the latest options. A poll that already has a vote gives "Can't edit a poll that already has votes".
- Step 7: in the add-photos, create-album and create-anecdote modals, start an upload. The Dropzone dims, ignores drops, and Tab skips both the zone and the "select files" link. After upload, it's usable again.
- Step 8: react to a post in one tab. In another tab, `router.refresh()` (or wait for a realtime refresh) shows the updated count without a reload. With the network blocked on the refetch, a story or comment reaction stays applied and the console shows a warn log, not "Unhandled promise rejection".
- Step 9: run the server with `TZ=UTC` and the browser in Europe/Paris. Load the feed with comments: no hydration warning, and times show Paris time. Switch the browser's time zone in DevTools Sensors to America/New_York and reload: times show New York time after load, with no warning. A comment from last year shows the year.
- Step 10: with the post modal open twice (or edit and create both mounted), every label focuses its own field, and the ids are unique in the DOM.
- Step 11: send a test push from settings. The title is "Le petit monde".
- Step 12: switch to fr. The install card's iOS step and the guess reopen confirm keep « and » attached to their words at narrow widths.
- Step 13, in all three places (post, story viewer, comment):
  - Tap a pill you haven't reacted with: your reaction is added or switched, and the count updates instantly.
  - Tap your own pill: it's removed.
  - Offline: it rolls back and a toast shows.
  - "Who reacted" opens the names list with mouse, touch and keyboard.
  - In the story viewer, tapping a pill doesn't navigate or pause.
  - As a **member who can't see a post** (no circle), the post doesn't show, and calling `addReaction` for it directly is still rejected.
