# Story reaction notifications link to the story

## Status: implemented

Shipped as planned, no deviations: `?storyId=` query param on the feed URL,
threaded from `page.tsx` → `feed_view.tsx` → `story_tray.tsx`, which computes
the initial `viewerTarget` via a lazy `useState` initializer from the
server-rendered `initialStories`/`initialHighlights` (an effect wasn't
needed after all, since that data is already available synchronously at
mount — simpler than the effect-based approach originally sketched here, and
avoids a `react-hooks/set-state-in-effect` lint error). `story_viewer.tsx`'s
index initializer now prefers an exact `target.storyId` match. See
`feat(stories): point story reaction notifications at the reacted story`.

When someone reacts to a story, the story's author gets a `new_story_reaction`
push/in-app notification, but its `url` is just `/baby/${babyId}/feed` —
tapping it lands on the feed with no way to know which story was reacted to,
let alone open it. Fix: point the notification at the specific story, and
teach the feed page to open the story viewer directly on that story when
it's told to.

## Root cause (confirmed by reading the code)

- `src/utils/actions/story_reactions.ts` (`addStoryReaction`) builds the
  notification with `url: \`/baby/${babyId}/feed\`` — no story reference.
- Compare `src/utils/actions/comment_reactions.ts` (`addCommentReaction`),
  which already does this correctly: `url: \`/baby/${babyId}/feed?postId=${comment.post_id}\``.
  `src/app/baby/[babyId]/feed/page.tsx` reads that `postId` search param and
  passes it down as `highlightPostId` to `FeedContent` → `feed_view.tsx`,
  which scrolls to `#post-${highlightPostId}` on mount.
- Stories have no equivalent mechanism at all today. They're not rendered
  inline in the feed list — they live in the "stories" bubble tray
  (`story_tray.tsx`) and open in a full-screen `StoryViewer` modal. The
  viewer is addressed by `ViewerTarget = { kind: 'group'|'highlight', index }`
  (`story_tray.tsx`), an index into the in-memory `groups`/`highlights`
  arrays — not a story id — and on mount it lands on the first *unseen*
  story in that group (`story_viewer.tsx` lines ~53-57), not a specific one.
- Note `new_story` (new story posted, `stories.ts` line ~102) has the exact
  same generic-URL gap, but that's out of scope here — this plan only fixes
  the reaction-notification path that was asked for.

## Design

1. Extend the feed page's search params, mirroring `postId`:
   - `src/app/baby/[babyId]/feed/page.tsx`: add `storyId?: string` to the
     `searchParams` type, read it, pass down as `highlightStoryId` next to
     the existing `highlightPostId` prop.
   - Thread `highlightStoryId` through `FeedContent`/`feed_view.tsx` down to
     `StoryTray` (same prop-drilling path `highlightPostId` already takes).

2. `story_tray.tsx`: accept `highlightStoryId?: string`. On mount (`useEffect`,
   once — guarded the same way `feed_view.tsx` guards `highlightPostId` with
   `scrolledRef` so it doesn't refire on unrelated re-renders), if set:
   - Search `groups` (active stories) for a `StoryGroup` containing a story
     with that id. If found, call
     `setViewerTarget({ kind: 'group', index: groupIndex, storyId: highlightStoryId })`.
   - If not found in `groups`, search `highlights` the same way (a story can
     be archived into a highlight after the notification was sent) and use
     `{ kind: 'highlight', index, storyId: highlightStoryId }`.
   - If not found in either (story was deleted, or expired and never
     highlighted), do nothing — user just lands on the feed with the tray
     visible, same as today's fallback for a stale `postId`.

3. Extend `ViewerTarget` (`story_tray.tsx`) to
   `{ kind: 'group'|'highlight'; index: number; storyId?: string }`.

4. `story_viewer.tsx`: change the initial-`index` lazy initializer (lines
   ~53-57) to prefer an exact match on `target.storyId` when present, falling
   back to today's logic otherwise:
   ```ts
   const [index, setIndex] = useState(() => {
     if (target.storyId) {
       const exact = stories.findIndex((s) => s.id === target.storyId)
       if (exact !== -1) return exact
     }
     if (isHighlight) return 0
     const firstUnseen = stories.findIndex((s) => !s.viewed)
     return firstUnseen === -1 ? 0 : firstUnseen
   })
   ```

5. `src/utils/actions/story_reactions.ts` (`addStoryReaction`): change the
   notification's `url` from `` `/baby/${babyId}/feed` `` to
   `` `/baby/${babyId}/feed?storyId=${storyId}` ``.

No changes needed in `notify.ts`, `notification_bell.tsx`, or the service
worker (`src/worker/index.ts`) — all three already just navigate to
whatever `url` is stored on the notification, which is exactly the
generic plumbing this plan relies on (confirmed by reading all three).

## Out of scope / not doing

- Not fixing `new_story`'s equally-generic feed URL (own story-creation
  notification) — different trigger, not what was asked; can reuse the same
  `?storyId=` mechanism later as a one-line follow-up if wanted.
- No DB/schema changes — this is UI wiring + one notification URL string.
- No change to `removeStoryReaction` — removing a reaction never sends a
  notification today, and that's not being added here.
- No realtime/SSE changes — unrelated to link routing.

## Testing checklist

- Typecheck (`tsc`/`next build` or project's usual check task).
- Manual: as user B, react to a story posted by user A; as user A, click the
  resulting notification (both the in-app bell and, if testable, the push
  notification) and confirm it opens the feed with the story viewer already
  showing the exact reacted-to story, not just the first unseen one in its
  group.
- Manual: react to a story, then let it expire out of `groups` (or delete
  it) before clicking the notification — confirm graceful fallback (feed
  loads, tray renders, no crash) instead of a viewer stuck on the wrong
  story or a thrown error.
- Manual: react to a story that has since been added to a highlight —
  confirm the viewer opens it via the `highlight` fallback path.
