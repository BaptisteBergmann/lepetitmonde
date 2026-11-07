---
tags: [lepetitmonde/feature]
---

# Feed

Up: [[Le petit monde]] · Route: `/baby/[babyId]/feed` · Code: `feed/`, `actions/posts.ts`, `comments.ts`, `reactions.ts`, `views.ts`, `post_stats.ts`

The main timeline ("Journal"). The [[Stories]] tray sits on top.

## Posts

Admins create posts (`create_post_modal.tsx`): a caption, a `taken_at` date, photos and videos (drag-and-drop `Dropzone`), an optional [[Polls|poll]] and a "visible to" circle selection. No circle selected = admin-only ([[Authorization]]). Media is uploaded through [[Storage and media|`/api/upload`]]; notifications are sent only once every upload succeeded. Post photos are mirrored into the [[Albums]] library.

## Interactions

- **Comments**: any member who sees the post. A comment stores a snapshot of its author's circles.
- **Reactions**: one of five baby-themed emoji per user (🍼 👶 😴 🎉 ❤️, `src/utils/reactions.ts`), on posts, comments and stories. The author is notified.
- **Views**: an `IntersectionObserver` marks a post as seen; admins see who saw it and a stats dialog (views, reactions, comments).
- **Lightbox**: full-screen viewer with pinch and double-tap zoom, swipe and keyboard navigation.

## Tables

`posts`, `post_photos`, `posts_circles`, `post_comments`, `comment_reactions`, `post_reactions`, `post_views` (see [[Data model]]).

Notifications: `new_post`, `new_comment`, `new_reaction`, `new_comment_reaction` ([[Notifications pipeline]]). Text limits: `feed-limits.ts`.
