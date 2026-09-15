## Status: implemented

Shipped as described below, no deviations. Verified with `mise exec -- npx tsc --noEmit` and `eslint` on the changed files (both clean); manual click-through in the browser was not performed in this session.

## Context

Clicking a notification (e.g. "X commented on your post") sent the user to `/baby/[babyId]/feed` — the top of the whole infinite-scroll feed — instead of to the post the comment/reaction/post actually concerns. The feed loads 10 posts at a time via cursor pagination ordered by `taken_at`/`created_at`, so the relevant post may not even be on the first page. This fix makes notification (and new-post email) links carry the post id, and makes the feed page scroll to and briefly highlight that exact post, fetching it individually if it isn't already in the first page. It also adds an admin-only "share this post" button that copies/shares the same deep link.

Scope: the four notification types that point at a specific feed post (`new_comment`, `new_reaction`, `new_comment_reaction`, `new_post`) plus the new-post email. Story-related notifications and non-feed types (pronostics, members, life stages, circle access, anecdotes) were left unchanged — they already point at other pages. No new `/post/[postId]` route was added; the deep link lands on the existing feed page and scrolls/highlights.

## What changed

- `src/utils/actions/posts.ts`: new `getPostById(postId, babyId)` reusing `withVisibility`/`toPostWithDetails`/`attachInteractionData`, returns `null` (not an error) when the post is missing/deleted/not visible. `createPost`'s push/in-app `url` and the `sendNewPostEmail` `postUrl` now both append `?postId=${data.id}`.
- `src/utils/actions/comments.ts`, `reactions.ts`, `comment_reactions.ts`: the `new_comment`/`new_reaction`/`new_comment_reaction` notify calls now append `?postId=...` (the comment-reaction case needed extending its `post_comments` select from `user_id` to `user_id, post_id`).
- `src/app/baby/[babyId]/feed/page.tsx`: `FeedPage` now reads `searchParams: Promise<{ postId?: string }>` (same pattern as `calendar/page.tsx`). `FeedContent` fetches `getPostById` alongside the normal page load, prepends the target post to `initialPosts` if not already present, and passes an explicit `initialHasMore` (computed from the *original* un-prepended page, not `initialPosts.length`) plus `highlightPostId` down to `FeedView`.
- `src/app/baby/[babyId]/feed/feed_view.tsx`: seeds `hasMore` from the new `initialHasMore` prop; a ref-guarded `useEffect` scrolls to `#post-<id>` once and clears the highlight after 3s.
- `src/app/baby/[babyId]/feed/_components/post_card.tsx`: outer card now has `id={post-<id>}` and a `highlighted` prop (temporary `ring-2 ring-primary` treatment). Added an admin-only `Share2` icon button in the existing stats/edit/delete row that uses `navigator.share` when available, falling back to `navigator.clipboard.writeText` + a `sonner` toast.
- `messages/en.json` / `messages/fr.json`: added `feed.postCard.shareTitle` and `feed.postCard.linkCopied`.

## Verification performed

- `mise exec -- npx tsc --noEmit` — clean.
- `npx eslint` on all seven changed source files — clean.
- Not performed: live click-through of a real notification/email in the browser, and clipboard/share-sheet testing on a real device.
