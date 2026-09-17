# Story viewer: resume-at-first-unseen + dedicated pause zone

## Status: implemented

Shipped as planned, no deviations. `StoryWithUrl.viewed` added in
`stories.ts`; `story_viewer.tsx` now lazily initializes `index` to the
first unseen story and splits tap handling into three zones (left 30% /
middle 40% / right 30%) with a separate `manuallyPaused` toggle that
resets on story change, alongside the pre-existing `holdPaused` momentary
pause.

Improve `StoryViewer` (`src/app/baby/[babyId]/feed/_components/story_viewer.tsx`)
so it behaves closer to Instagram in two ways the user asked for:

1. Opening a story group jumps straight to the first story the current
   user hasn't seen yet (e.g. they saw #1 and #2, a #3 got posted → opening
   the bubble starts at #3), while still allowing free back-and-forth to
   the already-seen #1/#2 via the existing prev/next controls.
2. Tapping the **middle** of the screen pauses/resumes autoplay, as a
   distinct third zone alongside the existing left-tap-back /
   right-tap-forward zones.

## Already in place (do not rebuild)

- **Back-and-forth navigation already exists.** `goPrev`/`goNext`
  (`story_viewer.tsx:55-67`), tap-left/tap-right dispatch in
  `handlePointerUp` (`story_viewer.tsx:127-135`), desktop chevrons
  (`story_viewer.tsx:274-286`), and arrow-key support (`story_viewer.tsx:71-74`)
  all already let the user step back to a previous story instead of only
  going forward. Nothing to add here beyond the zone change in item 2 below.
- **"Seen" tracking is fully implemented end-to-end**, just not used yet to
  pick a starting index:
  - `story_views` table (`story_id, user_id, viewed_at`, unique on
    `(story_id, user_id)`).
  - `markStoryViewed(storyId, babyId)` (`stories.ts:226-243`) — idempotent
    upsert, called from the reset effect (`story_viewer.tsx:87-99`) for every
    non-highlight story as it's shown.
  - `getViewedStoryIds(storyIds, userId)` (`stories.ts:141-153`) — private
    helper already used to compute `StoryGroup.allViewed`
    (`stories.ts:216`) and to sort unseen groups first (`stories.ts:219`).
  - `getStoryViews` (admin "seen by" list) — unaffected by this change.
  - Highlights are deliberately excluded from seen-tracking (comment at
    `story_viewer.tsx:83-86`) — keep that exclusion; highlights always open
    at index 0.
- **Auto-advance + progress bar** (`story_viewer.tsx:101-106`, `161-180`) —
  reused as-is; pausing just needs to also respect the new middle-tap state.
- **No animation/gesture library** is used anywhere in the app (checked
  `package.json`) — stay consistent and keep this hand-rolled with native
  Pointer Events + the existing `story-progress` CSS keyframe
  (`src/app/globals.css:209-215`), no new dependency.

## Gap: no per-story `viewed` flag reaches the client

`getActiveStories` computes `allViewed` per **group**
(`stories.ts:211-217`) but never exposes which *individual* stories in the
group are viewed — `StoryWithUrl` (`stories.ts:18-23`) has no `viewed`
field. That's the one piece of plumbing missing before the viewer can pick
a smart starting index.

## Changes

### 1. `src/utils/actions/stories.ts`

- Add `viewed: boolean` to `StoryWithUrl` (line ~18-23).
- In the story-building loop (`stories.ts:201-207`), set it from the
  already-fetched `viewedIds` set: `viewed: viewedIds.has(story.id)`.
  `viewedIds` is already in scope at that point — no new query.

### 2. `src/app/baby/[babyId]/feed/_components/story_viewer.tsx`

**Initial index:**

- Replace `const [index, setIndex] = useState(0)` (line 42) with a lazy
  initializer that, for `kind === 'group'`, finds the first story with
  `viewed === false` and starts there; if all are viewed (or the group is
  empty edge case), fall back to `0`. For `kind === 'highlight'`, always
  start at `0` (no `viewed` field exists there, matching the existing
  exclusion).
  ```ts
  const [index, setIndex] = useState(() => {
    if (isHighlight) return 0
    const firstUnseen = stories.findIndex((s) => !s.viewed)
    return firstUnseen === -1 ? 0 : firstUnseen
  })
  ```
  Since `StoryViewer` is only ever mounted fresh when `viewerTarget` flips
  from `null` to a value in `story_tray.tsx:165-175` (never re-targeted
  while already mounted), a lazy `useState` initializer is sufficient —
  no extra effect/key-reset plumbing needed.
- `goPrev`/`goNext` are untouched: they already allow moving freely across
  the whole `stories` array regardless of where playback started, so
  stepping back to the previously-seen #1/#2 just works once the start
  index is right.

**Middle tap = pause, as a third zone:**

- Currently `handlePointerUp` (`story_viewer.tsx:127-135`) only splits the
  screen into two halves (`clientX < innerWidth/2` → prev, else → next),
  and pausing is done separately, only via press-and-hold
  (`HOLD_THRESHOLD_MS`, lines 119-125). Add a middle zone so a quick *tap*
  (not a hold) in the center toggles pause:
  ```ts
  const LEFT_ZONE = 0.3   // clientX / innerWidth < 0.3 → prev
  const RIGHT_ZONE = 0.7  // clientX / innerWidth > 0.7 → next
  // in between → toggle pause
  ```
- Introduce a persistent pause flag separate from the transient
  hold-to-pause, e.g. rename current `paused` usage so there are two
  concerns merged into one derived value:
  - `holdPaused` (existing behavior, renamed from `paused`): true while
    the pointer is held down past `HOLD_THRESHOLD_MS`; resets to `false`
    on pointer up.
  - `manuallyPaused`: new `useState(false)`, toggled by a middle-zone tap
    in `handlePointerUp`; reset to `false` whenever `index` changes (in the
    existing reset effect, `story_viewer.tsx:87-99`) so autoplay resumes
    automatically on the next/prev story, matching how a momentary pause
    is expected to behave.
  - Everywhere the code currently reads `paused` (the auto-advance effect
    at `story_viewer.tsx:101-106`, the video play/pause effect at
    `108-113`, and the progress-bar `animationPlayState` at `173`), read
    `const isPaused = holdPaused || manuallyPaused` instead.
- Updated `handlePointerUp`:
  ```ts
  const handlePointerUp = (e: React.PointerEvent) => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    if (wasHeld.current) {
      setHoldPaused(false)
      return
    }
    const ratio = e.clientX / window.innerWidth
    if (ratio < LEFT_ZONE) goPrev()
    else if (ratio > RIGHT_ZONE) goNext()
    else setManuallyPaused((v) => !v)
  }
  ```
- Optional, small UX polish (not required, mention as a follow-up if the
  user wants it): show a centered pause icon overlay while
  `manuallyPaused` is true, so the paused state is visually obvious beyond
  the frozen progress bar.

### No changes needed

- `story_tray.tsx` — ring-color logic (`group.allViewed`) is unaffected.
- `getStoryViews`, `getHighlights`, `story_highlights.ts` — untouched.
- DB schema — no migration needed; `story_views` already has everything
  required.

## Edge cases

- Group where all stories are already viewed (re-opening a seen ring):
  starts at index `0` (replay from the start), same as Instagram.
- Group with a single story: `findIndex` trivially returns `0` either way.
- Middle-tap while a video is playing: the video play/pause effect
  (`108-113`) already keys off the pause state and will call
  `video.pause()`/`video.play()` once it reads the combined `isPaused`.
- Deleting the current story (`handleDelete`, `story_viewer.tsx:152-157`)
  calls `goNext()` afterward — unaffected by this change.

## Manual test plan

1. As a non-admin viewer, view stories #1 and #2 of a group, close the
   viewer, have an admin post #3. Reopen the group bubble → viewer opens
   directly on #3.
2. From #3, tap the left third of the screen twice → lands back on #1;
   confirm progress bar segments for #1/#2 show full, #3 shows empty/reset.
3. Tap the middle of the screen → autoplay timer stops advancing and the
   progress bar animation freezes; tap the middle again → resumes and
   finishes the segment.
4. Confirm press-and-hold anywhere still pauses momentarily and resumes on
   release, without permanently toggling `manuallyPaused`.
5. Open a highlight (not a group) → still starts at index `0` regardless
   of any prior views (unaffected — highlights have no seen-tracking).
6. Reopen a fully-seen group → starts at index `0` (replay), not stuck at
   the last slide.
