# Journal (feed) UI/UX polish

Status: implemented

## Status: implemented
Shipped 2026-10-06 after 2 builder/reviewer rounds (reviewer approved round 2). All steps 1–9 incl. 6b. Not browser-tested before deploy.
Deviations: story viewer and photo lightbox use Base UI Dialog directly (no fallback) with `disablePointerDismissal`; "Play video" pill only on `NotAllowedError`; Escape in a non-empty highlight-name input is ignored; bottom nav hides only when a field is focused and the visual viewport is >150px shorter than the window; reaction pickers roll back only on mutation failure; removed unused keys `feed.emptyCircleSuffix`, `feed.loading`, `feed.postCard.shareTitle`, `a11y.viewStats`, `feed.comments.empty`.
Follow-ups: `onChanged()` refetch in comment/story pickers can reject unhandled; post ReactionPicker doesn't resync from props after refresh; create_post_modal uses fixed `id="caption"`/`id="taken_at"`; ~6 older fr « » strings lack non-breaking spaces; SSR date formatting may mismatch across time zones.
Approved by: Baptiste (2026-10-06, user asked to work on the UI changes directly; design questions resolved with defaults: mute is per viewer session, Journal h1 stays sr-only)

## Goal
Clear the remaining UI/UX backlog from the designer review of the Journal page (`/baby/[babyId]/feed`). The work covers story viewer controls, focus trapping, accessible media tiles, the admin actions menu, shorter comment threads, form labels, errors that currently fail silently, optimistic reactions, the loading and empty states, reduced motion, and copy. It affects every family member who uses the feed. Admins are the only ones who create content.

## Out of scope
- Making a tap on a reaction pill add that reaction. This is a separate follow-up and the user's decision is already recorded.
- RLS, server-action auth and any `src/utils/actions/*` changes. Everything here is client-side or copy. The one exception is reading the `PostWithDetails.poll` field that is already returned.
- Anything already shipped in `.claude/plans/done/journal-review-fixes.md`: the poll row redesign, the locked modal and upload progress, story viewer group-by-key, pause during the highlight picker, the nav pointer fix and the highlight crash.
- Work the concurrent builder owns: retry-safe creates, the Dropzone being disabled while pending, the tappable 0-vote poll row and server-action auth. This covers `create_post_modal.tsx`, `create_story_modal.tsx`, `poll_voter.tsx`, `posts.ts`, `polls.ts`, `storage.ts`, `albums.ts` and `notify.ts`. This plan does not touch `poll_voter.tsx` or any action file. The two create modals only get the small, separate label edits in step 6b, which is gated (see step 6b).
- Adding a photo to or removing one from an existing post (an existing user decision).

## Current state
All paths below are under `src/app/baby/[babyId]/feed/` unless noted. At the start of each step, re-read the files. Don't trust the line numbers here: the code may have moved.

- `page.tsx` is a Server Component. It runs `assertPageAccess` and `getUserAccess`, then renders `<FeedContent>` inside a `<Suspense>` whose fallback is a centred `Loader2` spinner plus `feed.loading`. The page has no `h1`. `loading.tsx` is a separate pulse skeleton that uses `bg-muted`, not the real card colours. The todo and leaderboard pages use a visible `h1.font-display.text-3xl` with a subtitle (`src/app/baby/[babyId]/todo/page.tsx`).
- `feed_view.tsx`:
  - `loadMore` has `try/finally` but no `catch`, so a failure is silent.
  - The empty state is a single line of muted text (`feed.empty`).
  - There is no end-of-feed marker.
  - The deep-link `scrollIntoView` always uses `behavior: 'smooth'`.
- `_components/post_card.tsx`:
  - The root is a `<div>`.
  - Photo and video tiles are clickable `<img>` and `<div>` elements, not buttons, and their `alt` is the post caption.
  - The grid renders every photo (1 column, or 2 columns for 2 or more).
  - Videos use `preload="metadata"` even when they have a poster.
  - Admins get 4 small icon buttons: Share has only `title`, while Stats, Edit and Delete have `aria-label`.
  - The `" (no members)"` badge suffix is built by string concatenation, and the same code is duplicated in `post_stats_modal.tsx`.
- `_components/story_viewer.tsx` is a hand-rolled `role="dialog"` overlay, portalled to `<body>` at `z-[60]`, with a focus-on-open and restore effect.
  - It has no focus trap.
  - A window `keydown` handler handles Escape and the arrow keys. Escape fires even while a reaction Popover is open, so it closes the whole viewer.
  - The prev/next buttons are `hidden sm:flex`.
  - The only way to pause is a tap in the middle zone, and nothing shows that the viewer is paused.
  - Videos autoplay unmuted, and `play()` rejections are swallowed with `.catch(() => {})`.
  - There is no bottom safe-area padding, and the caption has no height limit.
  - "Seen by" uses `views.names.join(", ")`.
  - The highlight picker input has no label and uses `focus:outline-none`. Its chips are about 24px tall, Enter does nothing, and `handleAddToHighlight`, `handleCreateHighlight` and `handleDelete` have no error handling.
- `src/components/photo_lightbox.tsx` uses the same hand-rolled overlay pattern without a focus trap. It is also used by `albums_view.tsx`, `album_detail_view.tsx` and `src/app/share/album/[token]/_components/shared_album_view.tsx` (the public share page).
- `src/components/modal.tsx` already wraps the Base UI `Dialog` (focus trap, Escape, scroll lock) with its own `ConfirmProvider`, so that confirm dialogs nest inside the modal. Its max height is `max-h-[90vh]`. It has 18 users (feed, albums, calendar, anecdotes, todo, inventory, guess, bug report).
- `_components/comment_list.tsx`:
  - It renders every comment (sorted ascending by `created_at` in `getComments`).
  - With zero comments it shows "No comments yet."
  - Dates are always formatted `d MMM`.
  - Edit-on-Enter ignores IME composition.
- `_components/comment_input.tsx` has no `aria-label` (placeholder only), and Enter submits even during IME composition.
- `src/app/_header/bottom_nav.tsx` is a fixed `z-40 md:hidden` bar that stays visible while the mobile keyboard is up, so it covers the comment input.
- Reaction pickers:
  - `reaction_picker.tsx` keeps local state but waits for the server, then refetches. It is not optimistic.
  - `story_reaction_picker.tsx` and `comment_reaction_picker.tsx` render straight from `initialReactions` and call `onChanged()` to refetch.
  - All three swallow errors with `console.error` and have no toast.
  - The emoji buttons only have `title`, with no `aria-pressed` and no `aria-label`, and they use `p-1.5` (smaller than a touch target).
  - The pills have no label. The comment trigger is `h-5 w-5`.
- `_components/post_stats_modal.tsx` calls `getPostStats(...).then(setStats)` with no `catch`. If the call fails, the modal shows "Loading..." forever. Names are joined with `", "`.
- `_components/edit_post_modal.tsx`:
  - It refetches the poll with `getPollWithResults` in an effect, even though `post.poll` (type `PollWithResults | null`) is already on the post.
  - The "Visible to" `Label` isn't tied to its `SelectTrigger`.
  - The poll question and option inputs have only placeholders.
- `_components/edit_story_modal.tsx`: the "Visible to" `Label` isn't tied to its trigger. The create modals also have "Duration" and "Visible to" labels that aren't associated.
- `_components/story_tray.tsx`:
  - The bubble `<img alt={title}>` repeats the visible text label.
  - The unseen state is shown only by ring colour.
  - The add bubble reads "Add" (`storyTray.add`).
- `_components/constants.ts` (`CIRCLE_COLORS`) is unused. The calendar imports its own `calendar/_components/constants.ts`.
- Client error logging: `console.error` remains in `comment_list`, `comment_input`, `comment_reaction_picker`, `story_reaction_picker`, `reaction_picker`, `edit_post_modal`, `edit_story_modal` and `post_card`. The project pattern for client components is the Pino `logger.child(...)` from `@/utils/logger` (see `guess/admin/_components/funny_toggle.tsx`).
- `formatNamesPreview` (`src/utils/users.ts`) appends `" ..."`.

Drift from CLAUDE.md, known and unchanged: Server Actions live in `src/utils/actions/`, and there is no `@/utils/supabase/client`.

## Approach
These are small, independent client-side edits that reuse existing primitives:
- the Base UI `Dialog` (the same approach as `src/components/modal.tsx`) for the two full-screen overlays
- `DropdownMenu` (the same approach as `src/app/_header/user_menu.tsx`) for admin actions
- the "adjust state during render" resync pattern already used in `feed_view.tsx` and `story_tray.tsx`, for optimistic reactions
- `sonner` toasts for errors, as elsewhere in the feed

No new dependencies, no new services and no server changes.

Alternative considered: a hand-written focus trap for the two overlays. It was rejected because Base UI Dialog also handles nested Escape (a Popover inside the viewer closes first), scroll lock and focus restore. That removes code instead of adding it.

## Data and migrations
- None. No tables, RLS or buckets.
- No need to regenerate `database.types.ts`.

## Access and security
- No new routes, actions or queries. Every data call reuses existing Server Actions that already check `babyId` membership: `getPosts`, `getPostStats`, the reaction actions, `addStoryToHighlight`, `createHighlight`, `deleteStory` and `getComments`.
- In step 6, `edit_post_modal` reads `post.poll` from the already-authorised `PostWithDetails` instead of calling `getPollWithResults` again. `updatePoll` still rejects edits server-side when votes exist (`cannotEditVotedPoll`), so a stale `pollHasVotes` can't corrupt data. At worst the user gets the existing `editError` toast.
- No service-role use, no new public endpoints, and no auth, email or push changes.
- `photo_lightbox.tsx` is also rendered on the public `/share/album/[token]` page. Step 2 only changes overlay mechanics, not what data is shown.

## Steps
Each step is one commit, plus the follow-up CHANGELOG commit required by CLAUDE.md. Run `pnpm typecheck && pnpm lint` before each commit. Re-read every file named in a step before editing it. The concurrent builder may have changed it.

Steps that need the designer's input are marked **[design]**.

### 1. Story viewer controls **[design]** — files: `_components/story_viewer.tsx`, `messages/en.json`, `messages/fr.json`
- Pause/Play button in the header (before Close):
  - The label is fixed (`a11y.pause`), with `aria-pressed={manuallyPaused}`. The icon swaps between Pause and Play.
  - Clicking toggles `manuallyPaused`.
  - While `manuallyPaused`, show a centred Play icon over the media with `pointer-events-none` and `aria-hidden`, so taps still reach the tap zones.
  - Hold-pause and confirm/edit/picker pauses don't show the icon.
- Prev/next: drop `hidden sm:flex` so the buttons render at every width. Appearance on mobile (size, opacity) is the designer's call. Keep the existing `stopPropagation` on pointer and click.
- Video sound:
  - Add `const [muted, setMuted] = useState(true)` and pass `muted={muted}` to `<video>`.
  - When the current story is a video, show a header toggle (`a11y.mute`, `aria-pressed={muted}`, Volume2/VolumeX).
  - `muted` persists across stories within one viewer session. Don't reset it on navigation.
- Tap-to-play fallback:
  - In the play effect, replace `.catch(() => {})` with `.catch(() => setNeedsTapToPlay(true))`.
  - When `needsTapToPlay`, render a centred button (`a11y.playVideo`) that calls `videoRef.current?.play()` and clears the flag. Stop pointer propagation the same way as the prev/next buttons.
  - Reset the flag in the existing per-story reset effect.
- Footer:
  - Wrap the caption, the reactions and "seen by" in one footer container with `style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}`, mirroring the top inset.
  - Caption gets `max-h-[30dvh] overflow-y-auto`.
- "Seen by": use `t('seenByNames', { names: formatNamesPreview(views.names) })`, the same as `post_views.tsx`.
- Highlight picker:
  - Wrap the input and create button in a `<form onSubmit>` (preventDefault, then `handleCreateHighlight`). Make the button `type="submit"`.
  - The input gets `aria-label={t('storyViewer.newHighlightLabel')}` and a visible `focus-visible:ring-2 focus-visible:ring-white/60`. Exact styling is the designer's call.
  - The chips get `min-h-9 px-3 touch-target relative`.
- Error handling and toasts:
  - Wrap `handleAddToHighlight`, `handleCreateHighlight` and `handleDelete` in `try/catch`.
  - Show `toast.success` on add/create (`storyViewer.addedToHighlight` with `{name}`).
  - Show `toast.error` on failure (`storyViewer.highlightError`, `storyViewer.deleteError`), and log with `logger.child({ function: 'StoryViewer.<handler>', babyId, storyId })`.
  - Only call `onChanged()`/`goNext()` on success.
- Don't change the Escape handling here; step 2 covers it.

### 2. Focus trapping for the story viewer and lightbox — files: `_components/story_viewer.tsx`, `src/components/photo_lightbox.tsx`
For both overlays:
- Replace the `createPortal` div, the manual focus effect and the manual `body.style.overflow` with `Dialog` (Root, `open`) → `DialogPrimitive.Portal` → `DialogPrimitive.Popup`.
- Use the primitives from `@base-ui/react/dialog` directly, or `DialogContent` with `showCloseButton={false}` and its centring classes fully overridden. The builder picks whichever leaves less override noise.
- Keep the existing full-screen classes (`fixed inset-0 z-[60] bg-black…`, z-index per `docs/z-index.md`) and keep `aria-label` (Base UI: give the popup `aria-label`, or a visually hidden `DialogTitle`).
- `onOpenChange(false)` maps to `closeViewer()` in the viewer and to `onClose()` in the lightbox.
- Remove `Escape` from the window `keydown` handlers. Base UI then closes the topmost layer, so an open reaction Popover, Select or nested EditStoryModal/confirm dialog consumes Escape first. This fixes "Escape closes the viewer while a popover is open".
- Keep the arrow-key handlers on window. In the viewer, also ignore keys whose target is inside `[data-slot="popover-content"]`.

Viewer only:
- `useConfirm()` currently resolves to the page-level provider. The confirm dialog would then render outside the viewer's Dialog and count as an outside interaction.
- Wrap the viewer body in its own `<ConfirmProvider>`, as `modal.tsx` does, and move the `useConfirm` call into an inner component rendered under it. Splitting the viewer into an outer `StoryViewer` (Dialog shell) and an inner `StoryViewerBody` is fine.
- Keep `closeViewer`'s click-swallow logic unchanged.

Lightbox only: keep `handleBackdropClick`. Disable Base UI outside-press dismissal if it interferes, since the popup is full-screen and there is no outside.

Check on the share page and albums that the lightbox still swipes and pinches.

### 3. Post card media and accessibility **[design]** — files: `_components/post_card.tsx`, `page.tsx`, `messages/*.json`
- Root `<div>` becomes `<article aria-labelledby={`post-${post.id}-date`}>`. The date `<p>` becomes `<h2 id=…>` with the same classes.
- Media tiles:
  - Each tile becomes a `<button type="button">` with `onClick={() => setLightboxIndex(index)}`.
  - Labels: `a11y.photoNOfM` "Photo {n} of {total}" for photos, `a11y.playVideoNOfM` "Play video {n} of {total}" for videos.
  - The inner `<img>` gets `alt=""`. The tile `<video>` gets `aria-hidden`.
  - Lightbox `alt` stays as-is.
- Grid:
  - Show at most 4 tiles.
  - When `photos.length > 4`, the 4th tile shows a "+N" overlay (N = total − 3, or total − 4 if the 4th tile itself also counts, as the designer decides). Its label appends `a11y.moreMedia` ("{count} more").
  - With exactly 3 photos, the first tile spans both columns. The aspect ratio is the designer's call.
  - The lightbox still receives the full `post.photos`.
- Videos: `preload={photo.thumbnailUrl ? 'none' : 'metadata'}`.
- Share button `aria-label`: skip, because step 4 replaces the button with a labelled menu item. If step 4 is dropped, add `aria-label={t('postCard.shareTitle')}`.
- `page.tsx`: add an `h1` with `t('title')` ("Journal") outside the `<Suspense>`, so it's present while loading and on the pending-access notice. Default is `sr-only`. The designer may make it visible like `todo/page.tsx`'s header.

### 4. Admin actions menu **[design]** — files: `_components/post_card.tsx`, `messages/*.json`
- Replace the 4 icon buttons with one `DropdownMenu` from `src/components/ui/dropdown-menu.tsx`:
  - The trigger is a `MoreHorizontal` icon button (`aria-label={tA11y('postActions')}`, `touch-target relative`). It shows `Loader2` while `deleting`.
  - Items: Share (Share2) · Statistics (BarChart3) · Edit (Pencil) · `DropdownMenuSeparator` · Delete (Trash2, `variant="destructive"`). Each item has an icon and a text label.
- Handlers are unchanged (`handleShare`, `setStatsOpen(true)`, `setIsEditing(true)`, `handleDelete`).
- Check that `navigator.share` still works from a menu-item click (user activation is preserved).
- Check that focus returns sensibly after the Modal or confirm closes.

### 5. Comments **[design]** — files: `_components/comment_list.tsx`, `_components/comment_input.tsx`, `src/app/_header/bottom_nav.tsx`, `messages/*.json`
- `comment_list.tsx`:
  - With zero comments, return `null` (drop `feed.comments.empty`).
  - Add `const [expanded, setExpanded] = useState(false)`. Collapsed, render `comments.slice(-2)` (the latest 2, since the list is ascending) and, when `comments.length > 2`, a text button above them: `comments.viewAll` "View all {count, plural, one {# comment} other {# comments}}". Clicking sets `expanded` to true. There's no collapse-back unless the designer wants one.
  - Dates: `isThisYear(parseISO(created_at)) ? 'd MMM' : 'd MMM yyyy'` (date-fns).
  - Edit input `onKeyDown`: `if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveEdit(...)`.
- `comment_input.tsx`: add `aria-label={t('inputLabel')}` and an IME guard on Enter (same as above). A newly added comment is the newest, so it is always visible when collapsed.
- `bottom_nav.tsx`:
  - Add a `keyboardOpen` state driven by document `focusin`/`focusout` listeners.
  - It is true when `document.activeElement` is a `textarea`, a contenteditable element, or an `input` whose type isn't button/checkbox/radio/file/submit/range/color/date.
  - Re-check on `focusout` in a `requestAnimationFrame`, so focus moving between fields doesn't flicker.
  - While true, return `null` (or hide with `hidden`, whichever the designer prefers).
  - This applies app-wide on mobile, which is intended. Note this in the commit.

### 6. Form labels and modal height — files: `_components/edit_post_modal.tsx`, `_components/edit_story_modal.tsx`, `src/components/modal.tsx`, `messages/*.json`; 6b separately: `_components/create_post_modal.tsx`, `_components/create_story_modal.tsx`
- `edit_post_modal.tsx`:
  - `const visibleId = useId()`, then `<Label htmlFor={visibleId}>` and `<SelectTrigger id={visibleId}>`. The Base UI trigger is a `<button>`, which is labelable.
  - Swap the hard-coded `id="caption"`/`"taken_at"` for `useId()` values while you're there.
  - The poll question input gets `aria-label={t('pollQuestionLabel')}`.
  - Option inputs get `aria-label={t('pollOptionPlaceholder', { number: index + 1 })}`.
  - Initialise the poll state lazily from `post.poll`: `existingPollId = post.poll?.id ?? null`, `pollHasVotes = (post.poll?.totalVotes ?? 0) > 0`, `pollEnabled = !!post.poll`, question and options from it. Delete the `getPollWithResults` effect and its import.
- `edit_story_modal.tsx`: the same `useId` and `htmlFor` association for "Visible to".
- `src/components/modal.tsx`: `max-h-[90vh]` becomes `max-h-[90dvh]`. Spot-check the album create/edit/info modals, the calendar create event modal and `day_detail_sheet`, and the bug report modal on a phone-sized viewport.
- **6b (gated)**: only after `git status` shows `create_post_modal.tsx` and `create_story_modal.tsx` clean, meaning the concurrent builder's work is committed. Re-read both files, then apply the same `useId` association to "Visible to" in both, to "Duration" in the story modal, and add the poll input `aria-label`s in the post modal. Keep this a separate commit, and don't touch the Dropzone or publish logic.

### 7. Silent errors and optimistic reactions **[design]** — files: `feed_view.tsx`, `_components/post_stats_modal.tsx`, `_components/reaction_picker.tsx`, `_components/story_reaction_picker.tsx`, `_components/comment_reaction_picker.tsx`, `src/utils/reactions.ts`, plus a `console.error` sweep of the feed `_components`, `messages/*.json`
- `feed_view.tsx` `loadMore`:
  - Add `catch`: log, then `toast.error(t('loadMoreError'))`. Leave `hasMore` unchanged so the button stays enabled for a retry.
  - When `!hasMore && posts.length > 0`, render a quiet end marker (`feed.endOfFeed`). Styling is the designer's call.
- `post_stats_modal.tsx`:
  - Use an `error` state. On fetch failure, show `postStats.loadError` and a Retry button (`common.retry`) that refetches.
  - Wrap the fetch in a callback used by both the effect and Retry.
  - Format names with `new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names)` (full list, since this is the detail view) for views, reaction names and poll voters.
- Optimistic reactions, in all three pickers:
  - Add a pure helper to `src/utils/reactions.ts`: `applyMyReaction(data: ReactionsData, next: string | null): ReactionsData`. It decrements or removes the old `myEmoji` entry, increments or adds `next` with count 1, and sets `myEmoji`, leaving `names` alone (the refetch fixes them). Use a type-only import of `ReactionsData`.
  - `story_reaction_picker` and `comment_reaction_picker` gain local state that mirrors `initialReactions` with the adjust-during-render pattern (as in `feed_view.tsx`), so `onChanged()` refetches still resync.
  - `pick`:
    1. Snapshot the current reactions, then `setReactions(applyMyReaction(...))` and close the picker.
    2. Await the server call.
    3. On success: refetch (post) or `onChanged()` (story/comment).
    4. On error: restore the snapshot, then `toast.error(t('error'))` (`reactions.error`) and log.
  - Replace the `pending` disable with an in-flight `useRef` guard that ignores taps while a request runs, so the trigger doesn't flash disabled.
- Accessibility and sizing for the pickers:
  - Emoji buttons: `aria-label={t(key)}`, `aria-pressed={myEmoji === emoji}`, `min-h-9 min-w-9`.
  - Triggers: `h-7 w-7` everywhere (comment trigger up from `h-5`), all `touch-target relative`.
  - Pills: `aria-label={t('pillLabel', { emoji, count })}`, plus `touch-target relative`.
- `console.error` sweep: replace every remaining `console.error` under `feed/` with `logger.child({ function: '<Component>.<handler>', babyId, … }).error(err, '…')` from `@/utils/logger`. Re-grep at commit time. Skip any concurrently-owned file that still shows as modified in `git status`.

### 8. Loading, empty state and motion **[design]** — files: new `_components/feed_skeleton.tsx`, `loading.tsx`, `page.tsx`, `feed_view.tsx`, `_components/story_tray.tsx`, `_components/post_card.tsx`, the three reaction pickers, `src/components/photo_lightbox.tsx`, `messages/*.json`
- `FeedSkeleton`:
  - A Server-safe component (no `'use client'`, no hooks; takes a `label` prop).
  - It mirrors the real layout: tray bubbles `size-14`, then cards `rounded-3xl bg-landing-surface border border-landing-border` with an image block and two text lines.
  - It uses `animate-pulse motion-reduce:animate-none`, has `role="status"` and an sr-only label.
  - `loading.tsx` renders it inside the page shell. `page.tsx`'s Suspense fallback renders it instead of the spinner, and the now-unused `Loader2` import is removed.
- Empty state in `feed_view.tsx`:
  - An icon plus `feed.empty` as a heading.
  - Admins: an inline button `feed.emptyAdminCta` ("Share the first memory") that calls `setCreateOpen(true)`.
  - Members: `feed.emptyMemberHint`.
- Reduced motion:
  - `motion-reduce:transition-none` on the post card shadow transition, the lightbox slide and the zoom transitions.
  - `motion-reduce:hover:scale-100 motion-reduce:scale-100 motion-reduce:transition-none` on the emoji buttons.
  - `motion-reduce:animate-none` on the viewer and lightbox fade-in.
  - The deep-link scroll uses `behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'`.
  - Leave the story progress bar animation alone, since it is the timer.
- Story tray:
  - `BubbleThumb` `<img alt="">`.
  - Unseen group buttons get `aria-label={t('unseenLabel', { title })}`.
  - Rename `storyTray.add` copy to "New story"/"Nouvelle story". The designer should check that the `w-16 truncate` label still fits.
- "New post" button on mobile: the size or icon-only treatment is the designer's call. It needs an accessible name if it goes icon-only.

### 9. Copy cleanup — files: `messages/en.json`, `messages/fr.json`, `_components/post_card.tsx`, `_components/post_stats_modal.tsx`, `src/utils/users.ts`, delete `_components/constants.ts`
- French "highlights" wording becomes "à la une":
  - `storyViewer.addToHighlights` → "Ajouter à la une"
  - `storyViewer.newHighlightPlaceholder` → "Nouvelle sélection à la une"
  - `a11y.createHighlight` → "Créer la sélection à la une"
  - Also the new step 1 keys.
- `feed.pendingAccess` (circle wording; non-gendered in French):
  - en: "You're not in a circle in this journal yet. An admin has been notified, and the content will appear as soon as you're added to one."
  - fr: "Aucun cercle ne vous est encore attribué dans ce journal. Un administrateur a été prévenu : le contenu apparaîtra dès qu'un cercle vous sera attribué."
- French "post" becomes "publication" (feminine agreement) in `postForm.uploadsFailed`, `lockedNotice`, `pollCreateError` and `uploadsFailedNotice`, for example "La publication n'est pas encore partagée", "Cette publication a déjà été créée", "…utilisez « Modifier » sur la publication".
- `a11y.react` → "Add a reaction"/"Ajouter une réaction".
- `a11y.storyViewer` → "Story viewer"/"Visionneuse de stories".
- `storyForm.groupPlaceholder` fr → "ex. : Journée à la plage".
- Replace `...` with `…` in every `feed.*` string (`loading`, `comments.inputPlaceholder`, `postStats.loading`, `postForm.publishing`, `postForm.saving`). Also change `formatNamesPreview`'s suffix from `' ...'` to `'…'`. This is shared across all pickers and `post_views`, and the change is intended.
- `feed.loadMore` → "Show older posts"/"Voir les publications plus anciennes".
- `postForm.sendEmailLabel` → "Notify by email"/"Prévenir par e-mail".
- `postForm.photoDateLabel` → "Date of the memory"/"Date du souvenir".
- Replace `emptyCircleSuffix` with `feed.circleBadge`: "{name}{empty, select, true { (no members)} other {}}" / "{name}{empty, select, true { (aucun membre)} other {}}". Use it in `post_card.tsx` and `post_stats_modal.tsx`, then delete `emptyCircleSuffix`.
- Delete `_components/constants.ts` after `grep -rn "feed/_components/constants"` confirms it's still unused.
- Check the en/fr key parity with a quick `jq`/python diff of the key sets before committing.

## Translations
New keys go in both `messages/en.json` and `messages/fr.json`. Add each in the step that uses it:
- Step 1: `a11y.pause` (Pause / Mettre en pause), `a11y.mute` (Mute / Couper le son), `a11y.playVideo` (Play video / Lire la vidéo), `feed.storyViewer.newHighlightLabel` (New highlight name / Nom de la sélection à la une), `feed.storyViewer.addedToHighlight` (Added to {name} / Ajoutée à « {name} »), `feed.storyViewer.highlightError` (Couldn't update highlights. / Impossible de mettre à jour la sélection.), `feed.storyViewer.deleteError` (Couldn't delete this story. / Impossible de supprimer cette story.)
- Step 3: `a11y.photoNOfM` (Photo {n} of {total} / Photo {n} sur {total}), `a11y.playVideoNOfM` (Play video {n} of {total} / Lire la vidéo {n} sur {total}), `a11y.moreMedia` ({count} more / {count} de plus)
- Step 4: `a11y.postActions` (Post actions / Actions sur la publication), `feed.postCard.share` (Share / Partager), `feed.postCard.stats` (Statistics / Statistiques), `feed.postCard.edit` (Edit / Modifier), `feed.postCard.delete` (Delete / Supprimer)
- Step 5: `feed.comments.viewAll` (ICU plural: View all # comments / Voir les # commentaires; one: View 1 comment / Voir le commentaire), `feed.comments.inputLabel` (Write a comment / Écrire un commentaire). Remove `feed.comments.empty`.
- Step 6: `feed.postForm.pollQuestionLabel` (Poll question / Question du sondage)
- Step 7: `feed.loadMoreError` (Couldn't load older posts. Try again. / Impossible de charger les publications plus anciennes. Réessayez.), `feed.endOfFeed` (You're all caught up / Vous avez tout vu), `feed.postStats.loadError` (Couldn't load the statistics. / Impossible de charger les statistiques.), `reactions.error` (Couldn't save your reaction. / Votre réaction n'a pas pu être enregistrée.), `reactions.pillLabel` ({emoji} {count}, see who reacted / {emoji} {count}, voir qui a réagi)
- Step 8: `feed.emptyAdminCta` (Share the first memory / Partager le premier souvenir), `feed.emptyMemberHint` (New photos and stories will appear here. / Les nouvelles photos et stories apparaîtront ici.), `feed.storyTray.unseenLabel` ({title}, new / {title}, nouveau). Use `common.loading` for the skeleton label.
- Step 9: the rewordings listed in step 9, `feed.circleBadge` (new), and removal of `feed.emptyCircleSuffix`.

The concurrent builder may also be editing `messages/*.json`, for example for `serverErrors`. Re-read before each edit and only touch the keys listed.

**Where this list and the Design → Copy table disagree, the Copy table wins** (it refines a few strings: `endOfFeed`, `empty`, `unseenLabel`, `highlightError`, `newHighlightLabel`, `viewAll` en).

## Design

Design rules used throughout:
- Feed surfaces use the `landing-*` tokens (`bg-landing-surface`, `bg-landing-background`, `border-landing-border`, `text-landing-foreground`, `text-landing-muted`), which already have `.dark` values in `src/app/globals.css`. Don't use raw colours. The story viewer stays on its fixed black background with `white/xx` tints, as it does today.
- Every small control keeps the `touch-target relative` pair. Icon buttons use 36px visual size on touch (`pointer-coarse:`) and get 44px from `touch-target`.
- Headings use `font-display` (Fraunces) only where a heading is visible (empty state, "+N"). Card dates keep their current DM Sans styling.
- z-index: viewer and lightbox stay `z-[60]`; DropdownMenu and Popover are already `z-[70]` in `src/components/ui/`. Nothing new gets a z-index.
- Focus: every new interactive element gets `outline-none focus-visible:ring-2` with `ring-ring` on light surfaces or `ring-white/70` inside the viewer.

### User flow
1. Open the Journal → the `FeedSkeleton` (tray bubbles plus 2 card shapes, in real card colours) → the story tray, the "New post" button (admins) and the posts.
2. Tap a story bubble → the viewer opens on a black screen. A photo plays for 5s. A video starts **muted**, with a speaker-off button in the header.
3. Tap the header Pause button (or the middle of the screen) → the progress bar stops and a large faded Play icon sits in the middle. Tap again → it resumes and the icon disappears.
4. Tap the speaker button → sound comes on and stays on for the next videos until the viewer closes.
5. If the phone blocks autoplay (Low Power Mode) → a "Play video" pill appears in the middle. Tap it → the video plays.
6. Tap the visible ‹ › arrows or the left/right screen zones → previous/next story.
7. Admin taps ✦ (highlights) → the picker opens. They tap an existing chip, or type a name and press Enter → toast "Added to Beach day", picker closes. On failure → error toast, picker stays open with the text kept.
8. Back in the feed, a post with 7 photos shows 4 tiles. The 4th shows "+3". Tap any tile → the lightbox opens at that photo and all 7 can be swiped.
9. Admin taps "⋯" on a post → a menu with Share, Statistics, Edit, then (separated) Delete.
10. A post with 5 comments shows "View all 5 comments" above the latest 2. Tap → all 5 show. Tap the comment field → the keyboard opens and the bottom nav disappears, so the field and Send stay visible.
11. Tap a reaction → it appears on the trigger and in the pills instantly. If saving fails → it reverts and a toast explains.
12. Scroll to the bottom → "Show older posts". Once there are no more → a quiet "This is where it all began" marker.

### Screens

#### Story viewer (step 1)
Wireframe (mobile, 375px, admin, video story):
```
┌───────────────────────────────────────┐
│ ▬▬▬▬▬ ▬▬▬▬▬ ▬▬▬───── ─────────        │ progress (unchanged)
│ Beach day…   ✦  ✎  🗑  🔇  ⏸  ✕       │ header
├───────────────────────────────────────┤
│ [highlight picker, when open]         │
│ ┌───────────────────────────────────┐ │
│ │ ADD TO HIGHLIGHTS                 │ │
│ │ (Summer) (First steps) (Family)   │ │ chips min-h-9
│ │ [ New highlight…           ] [+]  │ │ <form>, h-10
│ └───────────────────────────────────┘ │
│                                       │
│ ‹                                   › │ size-9 on mobile
│                ( ▶ )                  │ paused indicator (aria-hidden)
│                                       │   or [ ▶ Play video ] pill
│                                       │
├───────────────────────────────────────┤
│ Caption text, scrolls past 30dvh…     │ footer
│ 😊  ❤️ 3  🍼 1                         │
│ 👁 Seen by Mamie, Papi, Léa…          │
│ ░░░░░░░░ safe-area inset ░░░░░░░░░░░░ │
└───────────────────────────────────────┘
```

- Layout:
  - Header: the title is a `min-w-0 flex-1 truncate` span. The control cluster is `flex items-center gap-1 shrink-0` in this fixed order: Highlight ✦ · Edit · Delete (admin, not in highlights) · **Mute** (video only) · **Pause** · Close. Mute sits just left of Pause, so Pause and Close never move when a photo is followed by a video. With all 6 buttons at 375px the title keeps about 100px and truncates, which is fine because the title is also in the tray.
  - Extract the repeated header button classes into one `const viewerIconButton = "p-1.5 pointer-coarse:p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer touch-target relative outline-none focus-visible:ring-2 focus-visible:ring-white/70"` and use it for all six buttons. Icons stay `h-4.5 w-4.5` (Close stays `h-5 w-5`).
  - Pause button: `Pause` icon while playing, `Play` icon while `manuallyPaused`. `aria-label={tA11y('pause')}`, `aria-pressed={manuallyPaused}`.
  - Mute button: `VolumeX` while `muted`, `Volume2` when sound is on. `aria-label={tA11y('mute')}`, `aria-pressed={muted}`. Render it only when `isVideo`.
  - Paused indicator: inside the media area, `absolute inset-0 flex items-center justify-center pointer-events-none`, containing `span.flex.size-16.items-center.justify-center.rounded-full.bg-black/40` with `Play className="h-8 w-8 text-white fill-white"`. Add `animate-in fade-in-0 duration-150 motion-reduce:animate-none`. Show it only when `manuallyPaused && !needsTapToPlay`.
  - Tap-to-play: same centring wrapper, but the wrapper stays `pointer-events-none` and the child is the button with `pointer-events-auto`. It is a labelled pill, not a bare icon, because some relatives won't guess what a lone Play circle means after autoplay silently failed: `button.inline-flex.h-12.items-center.gap-2.rounded-full.bg-black/60.px-5.text-sm.font-medium.text-white.backdrop-blur-sm.hover:bg-black/70.outline-none.focus-visible:ring-2.focus-visible:ring-white/70.cursor-pointer` with `Play className="h-5 w-5 fill-white"` + visible text `tA11y('playVideo')`. Since the text is visible, no separate `aria-label` is needed. It takes priority over the paused indicator.
  - Prev/next at every width. Mobile: `left-1`/`right-1`, `size-9 rounded-full bg-black/30 text-white/70`, icon `h-5 w-5`. From `sm:` keep today's look: `sm:left-2 sm:right-2 sm:size-auto sm:p-2 sm:bg-black/40 sm:text-white/80`, icon `sm:h-6 sm:w-6`. Both: `flex items-center justify-center hover:bg-black/60 hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70 touch-target`. Prev keeps `disabled:opacity-0 disabled:pointer-events-none` on the first story. The lower opacity on mobile keeps them from fighting with the photo, and the 30/70 tap zones keep working around them.
  - Footer: one `div.shrink-0.px-4.pt-3.space-y-3` with `style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}`. Inside it, in order:
    - Caption `p.max-h-[30dvh].overflow-y-auto.overscroll-contain.text-sm.text-white.whitespace-pre-wrap`.
    - `StoryReactionPicker`.
    - "Seen by" row (`flex items-center gap-1.5 text-xs text-white/70`, Eye `h-3.5 w-3.5 shrink-0`).
    - Remove the old per-block `pt-3/pb-3/pb-4` juggling.
  - Highlight picker (inside the existing `mx-4 mb-2 p-3 rounded-2xl bg-white/10 space-y-2` panel):
    - Chips: `inline-flex items-center min-h-9 px-3 rounded-full bg-white/15 hover:bg-white/25 text-sm text-white cursor-pointer transition-colors touch-target relative outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50`. `gap-2` between chips (was 1.5) so 44px hit areas don't overlap much.
    - `<form className="flex items-center gap-2">`:
      - Input `h-10 flex-1 min-w-0 rounded-xl bg-white/10 px-3 text-base md:text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/60`. Remove `focus:outline-none`. Placeholder contrast goes from `/40` to `/50`.
      - Submit `size-10 shrink-0 inline-flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 touch-target relative`. Disable it when the trimmed name is empty.
    - While an add/create request is in flight (`highlightSaving` local state), disable every chip and the submit button, and show `Loader2 h-4 w-4 animate-spin` in place of `Plus`. This prevents double-adds on a slow network.
- Components: everything stays inside `story_viewer.tsx`. No new shared component. Icons are lucide `Pause`, `Play`, `Volume2`, `VolumeX`, plus the existing ones.
- Typography and color: DM Sans throughout. White and `white/70–80` on black give AA contrast. Use no tokens here: the viewer is always dark in both themes.
- Interactions:
  - Header Pause and the middle-zone tap toggle the same `manuallyPaused`, so the button's `aria-pressed` always matches.
  - Hold-pause shows no indicator. Neither do the confirm, edit or picker pauses.
  - Mute persists for the viewer session only.
  - After a failed add/create, keep the picker open and keep the typed name, so the user can retry by pressing Enter again.
  - After a failed delete, stay on the story.

#### Post card media grid and article (step 3)
Wireframes (mobile, card is about 343px wide, `gap-0.5`):
```
1 photo           2 photos            3 photos            4 photos           5+ photos (e.g. 7)
┌──────────┐      ┌────┬────┐         ┌─────────┐         ┌────┬────┐        ┌────┬────┐
│          │      │    │    │         │  2 : 1  │         │ 1  │ 2  │        │ 1  │ 2  │
│  square  │      │ 1  │ 2  │         ├────┬────┤         ├────┼────┤        ├────┼────┤
│          │      │    │    │         │ 2  │ 3  │         │ 3  │ 4  │        │ 3  │ +3 │ ← photo 4, dimmed
└──────────┘      └────┴────┘         └────┴────┘         └────┴────┘        └────┴────┘
```
- Layout:
  - Grid stays `grid gap-0.5`: `grid-cols-1` for 1 photo, `grid-cols-2` otherwise. Visible tiles = `post.photos.slice(0, 4)`, keeping the original index for `setLightboxIndex`.
  - **3 photos:** the first tile gets `col-span-2 aspect-[2/1]` and the other two `aspect-square`. The whole block is then exactly square, the same height as a 2×2 grid, so feed rhythm stays even.
  - All other tiles are `aspect-square`, as today.
  - **"+N" rule:** N = `total − 4`, which is the number of items not shown at all. The overlay sits on the 4th tile, which is itself a real photo. Tapping it opens the lightbox **at index 3**, so the user sees that photo first and swipes on to the hidden ones. This matches the common Facebook/WhatsApp convention, and "+3" on a 7-photo post adds up (4 seen + 3 more).
  - Overlay: `absolute inset-0 flex items-center justify-center bg-black/50 text-white font-display text-3xl font-semibold` with text `+{N}`, `aria-hidden`. On a video 4th tile, the "+N" overlay replaces the Play badge. Use the label from `playVideoNOfM` + `moreMedia`.
  - Tile button: `relative block w-full overflow-hidden bg-landing-background cursor-pointer contain-paint outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:opacity-90`. The focus ring is **inset** because the card is `overflow-hidden`. The inner `img`/`video` is `h-full w-full object-cover`.
  - Accessible name: `tA11y('photoNOfM', { n: index + 1, total })`. On the "+N" tile, append `, ${tA11y('moreMedia', { count: N })}`, which gives "Photo 4 of 7, 3 more".
- `<article>` root keeps all current classes and the `id`. The date becomes `h2` with the same `text-sm font-semibold capitalize` (no `font-display`; it's a label, not a title).
- **`h1`: `sr-only`**, rendered in `page.tsx` as the first child of the `max-w-2xl` container, before `<Suspense>`: `<h1 className="sr-only">{t('title')}</h1>`. A visible title would push the story tray (the real header of this page) about 80px down on phones. Sibling content pages (albums, anecdotes) don't show a page title either. Todo and leaderboard are list or tool pages, where a title helps more.
- Larger screens: no change. The card is capped at `max-w-2xl`, so tiles top out at about 335px.

#### Admin actions menu (step 4)
Wireframe (card header, admin):
```
┌───────────────────────────────────────┐
│ Samedi 4 octobre 2026            [⋯]  │
│ (Famille) (Amis (aucun membre))        │
│                      ┌──────────────────┐
│                      │ ⤴  Partager      │
│                      │ ▥  Statistiques  │
│                      │ ✎  Modifier      │
│                      │ ──────────────── │
│                      │ 🗑 Supprimer     │  destructive
│                      └──────────────────┘
```
- Trigger: `DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}`. `Button` already brings `touch-target relative`, 28px desktop / 36px touch, and the focus ring. Add `className="-mr-1.5 -mt-1 rounded-xl text-landing-muted hover:bg-landing-background hover:text-landing-foreground aria-expanded:bg-landing-background aria-expanded:text-landing-foreground"`. The negative margins optically align the dots with the card padding. Icon `MoreHorizontal className="h-4.5 w-4.5"`. While `deleting`: `disabled` and `Loader2 h-4 w-4 animate-spin` in place of the dots. `aria-label={tA11y('postActions')}`.
- Content: `<DropdownMenuContent align="end" className="w-auto min-w-48">`. The `w-auto` override is required, because the default `w-(--anchor-width)` would make the menu 36px wide.
- Items: `className="min-h-10 pointer-coarse:min-h-11 gap-3 px-3 cursor-pointer"`. Each has an icon (`size-4`; default items add `text-muted-foreground` on the icon) plus a text label: Share2 `feed.postCard.share`, BarChart3 `feed.postCard.stats`, Pencil `feed.postCard.edit`, `DropdownMenuSeparator`, Trash2 `feed.postCard.delete` with `variant="destructive"`. Unlike `user_menu.tsx`, don't wrap the content in an extra `div`. The item is already `flex gap-2`.
- Keep the menu even on desktop. One control is calmer than four icons on every card, and admins are the only ones who see it.
- Share keeps its existing "Link copied" toast on the clipboard fallback.

#### Comments (step 5)
Wireframe (5 comments, collapsed):
```
──────────────────────────────────────
View all 5 comments                      ← text button
┌────────────────────────────────────┐
│ Mamie                 3 oct. à 18:02│
│ Trop mignon !                       │
│ 😊                                  │
└────────────────────────────────────┘
┌────────────────────────────────────┐
│ Léa              12 déc. 2025 à 9:15│  ← year shown when not this year
│ …                                   │
└────────────────────────────────────┘
[ Write a comment…                ] [➤]
```
- **"View all" placement:** the first child of the list, above the 2 shown comments. It reads in chronological order ("older ones are up here") and follows the familiar Instagram/Facebook pattern. Style: `button type="button" self-start text-xs font-semibold text-landing-muted hover:text-landing-foreground hover:underline underline-offset-4 py-1 rounded-md cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring touch-target relative`. No icon.
- On expand, the button unmounts. Move focus to the list wrapper (`ref`, `tabIndex={-1}`, `outline-none`) so keyboard and screen reader users land on the newly shown comments instead of `<body>`. **No collapse-back**: it would add a control nobody needs once they're reading.
- The trailing `border-t` and `space-y-3` in `post_card.tsx` are unchanged. With 0 comments the list returns `null`, so the section shows just the input under the divider.
- **Bottom nav: `return null`** while `keyboardOpen`. Don't use a transition. The keyboard is already animating, a slide would fight it, and unmounting avoids an invisible-but-focusable bar. The nav is `md:hidden` already, so desktop is unaffected.

#### Feed list: end marker, load-more error, empty state (steps 7–8)
Wireframes:
```
End of feed                               Empty (admin)                 Empty (member)
──────── This is where it all began ───          ( 📖 )                        ( 📖 )
                                           No memories yet               No memories yet
                                       [ + Share the first memory ]   New photos and stories
                                                                        will appear here.
```
- End marker (`!hasMore && posts.length > 0`): `div.flex.items-center.gap-3.pt-2.text-xs.text-landing-muted` with `span.h-px.flex-1.bg-landing-border` on each side (`aria-hidden`) and a `p` with `feed.endOfFeed` in the middle. Plain text, not a live region.
- Load more: unchanged `Button variant="outline"`. On error, a `toast.error` shows and the button stays enabled. The `Loader2` shows only while a request runs. No inline error, because the button itself is the retry.
- Empty state (`posts.length === 0`). This replaces the single line:
  - Wrapper `div.flex.flex-col.items-center.gap-3.py-12.text-center`, mirroring `PendingCircleAccessNotice` in `page.tsx`.
  - Icon `span.flex.size-12.items-center.justify-center.rounded-full.bg-primary/10.text-primary` with `BookOpen h-5 w-5` (the feed's icon in `page_registry.ts`).
  - Heading `h2.font-display.text-lg.font-semibold.text-landing-foreground` with `feed.empty`.
  - Admin: `<Button className="mt-1 gap-2 rounded-2xl"><Plus className="h-4 w-4" />{t('emptyAdminCta')}</Button>` → `setCreateOpen(true)`.
  - Member: `p.max-w-xs.text-sm.text-landing-muted` with `feed.emptyMemberHint`.
- **"New post" button on mobile: unchanged.** It keeps the visible label at every width. "Nouvelle publication" plus the icon is about 190px, so it fits easily at 375px. An icon-only "+" would be the clever-icon trade-off the brief warns against.

#### Post statistics modal (step 7)
```
┌ ▥ Statistiques ───────────────── ✕ ┐
│ Samedi 4 octobre 2026              │
│ (Famille)                          │
│ ┌────────────────────────────────┐ │
│ │ ⚠ Impossible de charger les    │ │  role="alert"
│ │   statistiques.                │ │
│ │ [ ↻ Réessayer ]                │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```
- Loading: keep `postStats.loading` text, adding `role="status"`.
- Error: `div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-landing-border bg-landing-background p-4"`, containing:
  - `p.flex.items-start.gap-2.text-sm.text-landing-foreground` with `AlertCircle h-4 w-4 mt-0.5 shrink-0 text-destructive` and `postStats.loadError`.
  - `<Button variant="outline" size="sm" className="gap-1.5 rounded-2xl"><RotateCw className="h-3.5 w-3.5" />{tCommon('retry')}</Button>`.
- Retry clears the error and shows the loading text again until the result comes back.
- Name lists use `Intl.ListFormat` as planned, with the existing `text-landing-muted` styling.

#### Reaction pickers (step 7)
- Emoji buttons, all three pickers: `inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-xl leading-none cursor-pointer transition-transform hover:scale-110 hover:bg-landing-background outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100`.
  - The selected one is `bg-landing-background ring-1 ring-primary/40 scale-110 motion-reduce:scale-100`. The ring gives a selected cue that doesn't rely on scaling, so it survives reduced motion.
  - Remove `p-1.5` and `title`. `aria-label` replaces `title`.
  - Popover row stays `flex-row gap-0.5 p-1.5`. Six buttons × 36px is about 230px, which fits at 375px.
- Triggers: `h-7 w-7` with `touch-target relative` everywhere.
  - Comment trigger goes from `h-5 w-5` to `h-7 w-7`, icon `h-3.5 w-3.5`, chosen emoji `text-sm`.
  - Remove `disabled:opacity-50` and the `disabled` prop. The in-flight ref guard replaces it, so nothing flashes.
- Pills:
  - Post pills: keep `h-7 px-2`.
  - Story pills: keep `h-7 px-2`.
  - Comment pills: `h-5` becomes `h-6 px-2`, and the comment picker row goes from `gap-1` to `gap-1.5`, so neighbouring 44px hit areas overlap less.
  - All pills get `touch-target relative outline-none focus-visible:ring-2` (`ring-ring`; `ring-white/70` for story pills) and `aria-label={t('pillLabel', { emoji, count })}`.
- Optimistic feedback: the trigger and pills update on tap. There is no spinner, and no success toast (the change itself is the feedback). On failure the state reverts and `reactions.error` shows as a toast.

#### FeedSkeleton (step 8)
Wireframe:
```
 (◯)  (◯)  (◯)  (◯)  (◯)          bubbles size-14 + label bar
 ▬▬   ▬▬   ▬▬   ▬▬   ▬▬
┌──────────────────────────────┐
│                              │
│      image block (square)    │  bg-landing-background
│                              │
├──────────────────────────────┤
│ ▬▬▬▬▬▬▬▬▬▬                   │  h-3.5 w-40  (date)
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬           │  h-3 w-3/4   (caption)
│ ●                            │  size-7 (reaction trigger)
└──────────────────────────────┘
┌──────────────────────────────┐  second card (mostly below the fold)
```
- File: `_components/feed_skeleton.tsx`, no `'use client'`, props `{ label: string }`.
- Root: `div role="status" aria-live="polite"` → `span.sr-only{label}` + `div aria-hidden className="space-y-4 animate-pulse motion-reduce:animate-none"`. `space-y-4` matches `FeedView`'s rhythm.
- Tray: `flex gap-3 overflow-hidden`, with 5 columns of `flex w-16 shrink-0 flex-col items-center gap-1`. Each column is `size-14 rounded-full bg-landing-border` plus `h-2.5 w-10 rounded-full bg-landing-border`.
- Cards (×2): `overflow-hidden rounded-3xl border border-landing-border bg-landing-surface`. The image is `aspect-square bg-landing-background`. The body is `p-4 space-y-3` with bars `bg-landing-border` (`h-3.5 w-40 rounded-full`, `h-3 w-3/4 rounded-full`) and `size-7 rounded-full`.
- `loading.tsx`: keep the page shell (`overflow-hidden text-landing-foreground` → `mx-auto max-w-2xl px-4 pt-5 pb-10 sm:px-6 sm:pt-8 sm:pb-16`) and render `<FeedSkeleton label={t('loading')} />` with `common`. Drop its own `role`, sr-only text and pulse, since the skeleton owns them.
- `page.tsx` Suspense fallback: `<FeedSkeleton label={tCommon('loading')} />`. Remove `Loader2`. `feed.loading` then becomes unused, so leave it for step 9 to decide whether to delete it.
- No "New post" placeholder: the skeleton can't know the role, and a button popping in is less jarring than a ghost button that disappears for members.

#### Story tray (step 8)
- **Add-bubble label fit:** "Nouvelle story" at `text-xs` DM Sans is about 80px, wider than `w-16` (64px). With `truncate` it would read "Nouvelle…", which loses the meaning. **Fallback: let this label wrap to 2 lines.** Use `w-full text-center text-xs leading-tight text-landing-muted line-clamp-2 break-words` on the add label only, so it reads "Nouvelle / story". English "New story" (about 54px) stays on one line. The buttons are flex columns, so bubble tops stay aligned and only the row height grows by one line. Group and highlight labels keep `truncate`. Visible text is the accessible name, so it needs no `aria-label`.
- Unseen groups: besides the `aria-label`, give the visible label `font-medium text-landing-foreground` while unseen, and keep `text-landing-muted` once seen. This adds a non-colour cue alongside the ring.
- `BubbleThumb` `img alt=""`. The letter fallback span gets `aria-hidden`.
- Bubble buttons: add `rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring` (no visible focus today).

#### Reduced motion (step 8)
As listed in step 8. Also:
- the paused indicator's `fade-in` (`motion-reduce:animate-none`)
- the emoji selected `scale-110` (`motion-reduce:scale-100`)

Leave alone:
- `DropdownMenu`/`Popover` zoom-in in `src/components/ui/`: it's short, and out of scope here.
- Spinners (`Loader2`): they convey state.

### States
- Loading:
  - Feed: `FeedSkeleton` in both `loading.tsx` and the Suspense fallback.
  - Load more: `Loader2` in the button.
  - Stats modal: `postStats.loading` text (`role="status"`).
  - Highlight picker: spinner in the submit button, chips disabled.
  - Story video: black background until the first frame (unchanged).
- Empty:
  - Feed: icon + "No memories yet" + an admin CTA, or the member hint.
  - Comments: nothing (input only).
  - Stats sections: existing `nobodyYet`/`noReactions`.
- Error:
  - Load more: toast `feed.loadMoreError`, and the button stays enabled.
  - Stats: inline alert + Retry.
  - Reactions: revert + toast `reactions.error`.
  - Highlight add/create: toast `storyViewer.highlightError`, picker stays open with the text kept.
  - Story delete: toast `storyViewer.deleteError`, stay on the story.
  - Autoplay blocked: the "Play video" pill.
- Success:
  - Highlight: `toast.success(addedToHighlight)`.
  - Reactions: instant (optimistic), no toast.
  - Share: existing "Link copied".
  - Delete post: card disappears on refresh (existing).
- Offline / slow:
  - Every action above fails into its error state. Nothing hangs forever. That is the point of the stats Retry.
  - The optimistic reaction shows immediately and rolls back when the request rejects.
  - Story neighbour preload is unchanged.

### Copy
New or changed keys from steps 1–8. Step 9 rewordings stay exactly as listed in step 9. Use a non-breaking space (U+00A0) inside French « » quotes.

| Key | English | French |
|-----|---------|--------|
| a11y.pause | Pause | Mettre en pause |
| a11y.mute | Mute | Couper le son |
| a11y.playVideo | Play video | Lire la vidéo |
| feed.storyViewer.newHighlightLabel | New highlight name | Nom de la nouvelle sélection à la une |
| feed.storyViewer.addedToHighlight | Added to {name} | Ajoutée à « {name} » |
| feed.storyViewer.highlightError | Couldn't update the highlight. Try again. | La sélection à la une n'a pas pu être mise à jour. Réessayez. |
| feed.storyViewer.deleteError | Couldn't delete this story. | Impossible de supprimer cette story. |
| a11y.photoNOfM | Photo {n} of {total} | Photo {n} sur {total} |
| a11y.playVideoNOfM | Play video {n} of {total} | Lire la vidéo {n} sur {total} |
| a11y.moreMedia | {count} more | {count} de plus |
| a11y.postActions | Post actions | Actions sur la publication |
| feed.postCard.share | Share | Partager |
| feed.postCard.stats | Statistics | Statistiques |
| feed.postCard.edit | Edit | Modifier |
| feed.postCard.delete | Delete | Supprimer |
| feed.comments.viewAll | {count, plural, one {View # comment} other {View all # comments}} | {count, plural, one {Voir le commentaire} other {Voir les # commentaires}} |
| feed.comments.inputLabel | Write a comment | Écrire un commentaire |
| feed.postForm.pollQuestionLabel | Poll question | Question du sondage |
| feed.loadMoreError | Couldn't load older posts. Try again. | Impossible de charger les publications plus anciennes. Réessayez. |
| feed.endOfFeed | This is where it all began | C'est ici que tout commence |
| feed.postStats.loadError | Couldn't load the statistics. | Impossible de charger les statistiques. |
| reactions.error | Couldn't save your reaction. | Votre réaction n'a pas pu être enregistrée. |
| reactions.pillLabel | {emoji} {count}, see who reacted | {emoji} {count}, voir qui a réagi |
| feed.empty (changed) | No memories yet | Pas encore de souvenirs |
| feed.emptyAdminCta | Share the first memory | Partager le premier souvenir |
| feed.emptyMemberHint | New photos and stories will appear here. | Les nouvelles photos et stories apparaîtront ici. |
| feed.storyTray.add (changed) | New story | Nouvelle story |
| feed.storyTray.unseenLabel | {title}, new | {title}, à voir |

Notes:
- `feed.empty` is now a heading, so it drops the trailing period. "Souvenirs" matches the CTA and the app's keepsake tone.
- `unseenLabel` fr is "à voir" because "nouveau/nouvelle" would have to agree with a title that can be a person's name or a group label.
- `endOfFeed` replaces "You're all caught up": that phrase describes the *top* of a feed (nothing new). At the *bottom* of a chronological family journal, the oldest memory is the point.
- After step 4, `feed.postCard.shareTitle` and `a11y.viewStats` are unused. The builder should grep and remove them in the step 9 copy commit if nothing else uses them.

### Accessibility
- Story viewer:
  - Pause and Mute are toggle buttons with fixed labels and `aria-pressed`. The paused indicator is `aria-hidden`.
  - The tap-to-play pill has visible text.
  - Prev/next are visible and focusable at all widths.
  - Header focus order: Highlight → Edit → Delete → Mute → Pause → Close, then the picker (when open), prev/next, the tap-to-play pill, the footer reactions.
  - Highlight input has an `aria-label` and a visible focus ring. Enter submits via `<form>`.
- Media tiles are real buttons with "Photo n of m" names. Inner media is `alt=""`/`aria-hidden`, so captions aren't read 4 times. The focus ring is inset so the card's `overflow-hidden` doesn't clip it.
- Each card is an `<article>` labelled by its `h2` date. There is exactly one `h1` (sr-only "Journal") per page, plus the empty-state `h2`.
- Admin menu: Base UI Menu gives arrow-key navigation, Escape, and focus return to the trigger. Each item has text plus a decorative icon.
- Comments: "View all" is a real button. On expand, focus moves to the list wrapper. The input has an `aria-label`. The IME guard prevents accidental sends.
- Reactions: emoji buttons have `aria-label` (the reaction name) and `aria-pressed`. Pills say "❤️ 3, see who reacted". The selected state is shown by a ring, not just scale.
- The skeleton is a single `role="status"` with an sr-only "Loading…", and the visual blocks are `aria-hidden`.
- The stats error uses `role="alert"`. Retry is a labelled `Button`.
- Contrast:
  - `text-landing-muted` on `bg-landing-surface` is already used for body hints in both themes.
  - Viewer text is `white/70` minimum on black.
  - The "+N" is white on `black/50` over a photo, at 30px semibold (large text).
- Reduced motion: as listed. The story progress bar is exempt because it is the timer.

### Questions
- Status: the parent agent relays that the user approved this scope directly on 2026-10-06. Per the designer process, I set the status to `draft` and did not mark it `approved` myself. The user (or the main session acting on the user's own message) should flip it to `approved` and fill "Approved by".
- Should story video mute state persist across sessions (e.g. `localStorage`)? Currently session-only, as planned. Persisting would help relatives who always want sound, but it's a small scope add.
- Would the user like a visible page title on the Journal like Todo? I chose `sr-only` (see step 3). Switching later is a one-line change.

## Risks and open questions
- **Status**: the parent agent says the user approved this scope on 2026-10-06 and wants to go straight from design to build. The planner doesn't set `approved`. Whoever completes the Design section should switch the status, per the user's instruction.
- **Base UI Dialog for the viewer (step 2)** is the riskiest change:
  - Pointer-zone navigation, the click swallowing in `closeViewer`, nested `EditStoryModal`, the confirm dialog (needs its own `ConfirmProvider`) and the Popover (`z-[70]`) all have to keep working.
  - If Base UI's outside-press or focus handling fights the tap zones, fall back to keeping the portal div and adding a small focus trap (Tab/Shift+Tab cycling within `containerRef`), plus an Escape guard that ignores events from inside `[data-slot="popover-content"]`.
  - Do step 2 as a single commit so it is easy to revert.
- The lightbox is shared with albums and the public share page. Step 2 changes the overlay on all of them, which is intended. Test all three.
- Hiding the BottomNav while a field has focus (step 5) affects every page on mobile. That is desirable, but it is a global behaviour change.
- Starting story videos muted (step 1) changes current behaviour: today they try to play with sound. The default is muted, and the choice persists within a viewer session only. It is not saved across sessions.
- `formatNamesPreview` changing `" ..."` to `"…"` (step 9) touches every names popover. This is intended.
- The French label "Nouvelle story" may truncate in the `w-16` tray label. The designer decides.
- Step 6b depends on the concurrent builder finishing. If those files are still dirty when the rest is done, leave 6b as a noted follow-up rather than editing over in-progress work.

## How to verify
- Steps 1–2 (story viewer), on a phone and a desktop:
  - Pause with the button: aria-pressed toggles and the centred Play icon shows. Resume.
  - Prev/next are visible on mobile, and tap zones still work.
  - A video starts muted. Unmute and navigate: it stays unmuted.
  - In iOS Low Power Mode (autoplay rejected), the tap-to-play button appears and works.
  - A long caption scrolls, and the footer clears the home indicator.
  - With the reaction popover open, Escape closes only the popover. A second Escape closes the viewer.
  - Tab cycles inside the viewer, and focus returns to the bubble after closing.
  - Highlight picker: Enter creates and shows a success toast. Go offline and add to a highlight: an error toast shows. Delete a story while offline: an error toast shows.
  - The edit story modal and the delete confirm still open over the viewer and don't close it.
- Step 2 (lightbox): open from a post, an album and `/share/album/<token>` (logged out). Swipe, pinch, double-tap zoom, backdrop click and Escape all work, Tab stays inside, and focus returns.
- Step 3:
  - A screen reader announces "Photo 2 of 5", not the caption.
  - A 3-photo post shows the spanning layout, and a 7-photo post shows 4 tiles with "+N". Tapping "+N" opens the lightbox at that index, and all 7 photos are browsable.
  - The video tile with a poster doesn't fetch metadata (DevTools Network).
  - The page has exactly one `h1`.
- Step 4: as an admin, the "⋯" menu opens with keyboard and pointer. Share, Stats, Edit and Delete work, and Delete still confirms. As a **non-admin member**, no menu is rendered.
- Step 5:
  - A post with 5 comments shows the latest 2 plus "View all 5 comments". A post with 0 comments shows no "No comments yet".
  - A comment from last year shows the year.
  - Composing with a Japanese or Korean IME and pressing Enter to confirm doesn't send.
  - On mobile, focusing the comment input hides the bottom nav, and blurring brings it back.
- Step 6:
  - Clicking the "Visible to"/"Duration" labels focuses the trigger, and a screen reader announces the label.
  - Editing a post with a poll shows the poll immediately (no network call to `getPollWithResults`).
  - Modals fit within the mobile viewport with the URL bar shown.
- Step 7:
  - Go offline and tap "Show older posts": a toast shows and the button stays usable.
  - At the end of the feed, the marker shows.
  - Make the stats fetch fail: an error and a Retry button show, not an infinite "Loading…".
  - Reacting updates instantly. Offline, the reaction rolls back and a toast shows.
  - A post with no more pages shows the end marker.
- Step 8:
  - Throttle the network: the skeleton matches the card styles in both `loading.tsx` and the Suspense fallback.
  - With an empty feed, an admin sees "Share the first memory", which opens CreatePostModal, and a **member** sees the hint with no button.
  - With "reduce motion" on in the OS, there are no pulse, scale or slide animations, and the deep link jumps instead of smooth-scrolling.
- Step 9:
  - Switch locale to fr and read through the feed. No "highlights" or "post" in the French copy, "…" is used everywhere, and badges show "(aucun membre)" for empty circles.
  - A **user with no circle** sees the new pendingAccess text.
  - `pnpm typecheck && pnpm lint` passes, and `constants.ts` is gone.
