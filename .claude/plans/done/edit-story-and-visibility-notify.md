# Edit story (caption/group/circles) + notify on newly-added circle visibility

## Status: implemented

Shipped as planned: `updateStory` (stories.ts), `EditStoryModal`, a Pencil trigger in
`story_viewer.tsx` gated `isAdmin && !isHighlight`, and the before/after
`getVisibleUserIds` diff added to both `updatePost` and `updateStory` to notify only
newly-visible users when a circle is added.

One deviation from the original sketch: since editing the group label can move a story
to a different tray bubble (`getActiveStories`' `byKey` grouping), `EditStoryModal`'s
`onSaved` closes the whole `StoryViewer` (not just the edit modal) instead of calling
`onChanged()` and staying open — the viewer's `target.index` could otherwise end up
pointing at the wrong bubble after the refetch. The user just lands back on the tray
and can re-open whichever bubble the story landed in.

Circle-visibility editing was included (not left out) per the follow-up request; only
highlighted-story editing stayed out of scope, as originally planned.

## Scope

1. Let admins edit an **active, non-highlighted** story's caption, group label, and
   visible-by circles — mirroring the existing post-edit flow. Highlighted stories are
   out of scope for now (same restriction the delete button already has).
2. Fix a notification gap that affects **both posts and stories**: today, adding a
   circle to an *existing* post/story's visibility never notifies the people newly
   able to see it — `notifyUsers` only fires from `createPost`/`createStory`.
   `updatePost` (and the new `updateStory`) currently update `posts_circles`/
   `stories_circles` silently.

## 1. Story edit

### `src/utils/actions/stories.ts`
Add `updateStory`, modeled on `updatePost`:

```ts
type StoryUpdate = { caption: string | null; groupLabel: string | null }

export async function updateStory(storyId: string, babyId: string, update: StoryUpdate, circleIds: string[]) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  // fetch current stories_circles for storyId BEFORE the update, for the
  // notify-on-added-circle diff (see part 2)

  const { error } = await supabase
    .from('stories')
    .update({ caption: update.caption, group_label: update.groupLabel })
    .eq('id', storyId)
    .eq('baby_id', babyId)
  // ...replace stories_circles same as updatePost replaces posts_circles...
  // ...notify newly-visible users (part 2)...

  revalidatePath(`/baby/${babyId}/feed`)
  // no revalidatePath('/albums'): editing caption/group/circles doesn't touch
  // the mirrored Photos-page copy (copyStoryPhotoToLibrary only runs on create)
}
```

Only fields the UI actually exposes are updatable — no `expires_at`/duration edit (out
of scope, wasn't asked for).

### `EditStoryModal` (new, `src/app/baby/[babyId]/feed/_components/edit_story_modal.tsx`)
Copy of `create_story_modal.tsx` minus the `Dropzone`/upload step (media is immutable
once posted), prefilled from the target `StoryWithUrl`:
- caption textarea
- group label input + datalist of `existingGroupLabels` (already threaded down to
  `story_tray.tsx`, reuse it)
- circles multi-select (reuse `circleItems` pattern from `create_story_modal`)
- Save → `updateStory(...)`, then `onChanged()` (same callback `story_viewer.tsx`
  already uses after delete/highlight actions) instead of `router.refresh()`, since
  the viewer manages its own group/story state.

Translation keys: `feed.storyForm` currently borrows `cancel`/`publishing`/`save`/
`saving` from `feed.postForm` (see `tShared` usage in `create_story_modal.tsx`) — keep
doing that. Add `storyForm.editTitle` and `storyForm.editError` (mirroring
`postForm.editTitle`/`editError`) to `messages/en.json` and `messages/fr.json`.

### Trigger: `story_viewer.tsx`
Add a `Pencil` icon button next to the existing Sparkles/Trash2 buttons in the header,
gated the same way as delete: `isAdmin && !isHighlight`. Opens `EditStoryModal` with
the current `story`, `babyId`, and `circles` (viewer doesn't currently receive
`circles` — needs threading down from `story_tray.tsx` → `feed_view.tsx`, same prop
already passed to `CreateStoryModal`).

## 2. Notify newly-visible users when circles are added (posts + stories)

Applies to **both** `updatePost` and the new `updateStory`. Editing caption/date alone
must stay silent — only fire when the *effective visible audience* grows.

Approach: diff visibility before vs. after the edit, not just "was a circle added" —
this also correctly handles simultaneous add+remove, and never double-notifies admins
(they're always in both sets since `getVisibleUserIds` includes every admin
unconditionally).

```ts
// inside updatePost / updateStory, before circles are replaced:
const { data: { user } } = await supabase.auth.getUser()
const { data: oldLinks } = await supabase
  .from('posts_circles') // or stories_circles
  .select('circle_id')
  .eq('post_id', postId) // or story_id
const oldCircleIds = (oldLinks ?? []).map((r) => r.circle_id)

const before = new Set(await getVisibleUserIds(babyId, oldCircleIds, user?.id))
const after = await getVisibleUserIds(babyId, circleIds, user?.id)
const newlyVisible = after.filter((id) => !before.has(id))

// ...do the update + posts_circles/stories_circles replace...

if (newlyVisible.length > 0) {
  const t = await getTranslations('pushNotifications')
  await notifyUsers(babyId, 'new_post' /* or 'new_story' */, {
    title: t('newPost.title'),
    body: post.caption || t('newPost.bodyFallback'),
    url: `/baby/${babyId}/feed?postId=${postId}`,
  }, newlyVisible)
}
```

Reuses the existing `new_post`/`new_story` notification types and copy rather than
adding a new enum value + translations — from the newly-visible recipient's
perspective it *is* the first time this content appears in their feed, so the same
"New post"/"New story" title reads correctly. No DB migration needed.

Not in scope: emailing newly-visible users (`sendNewPostEmails` is a create-time,
opt-in-checkbox thing; extending it to edits wasn't asked for and adds a second
consent question — flag as a follow-up if wanted).

### Files touched for part 2
- `src/utils/actions/posts.ts` — `updatePost` gains the diff + conditional `notifyUsers` call.
- `src/utils/actions/stories.ts` — same, inside the new `updateStory`.

## Out of scope (explicit)
- Editing highlighted stories.
- Editing story duration/`expires_at`.
- Email notifications on newly-added circles.
- Any change to `circle_access_granted` (that's user↔circle membership, unrelated).

## Verification
- Typecheck (`mise run` whatever the project's TS check task is).
- Manual: create a story with circle A only; add circle B via edit → member of B (not
  yet in A) gets a `new_story` in-app + push notification; a member already in A does
  not get a duplicate.
- Manual: edit only the caption (no circle change) → no notification fires.
- Manual: same two checks for posts via `EditPostModal`.
