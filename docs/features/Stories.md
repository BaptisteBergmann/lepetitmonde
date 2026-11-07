---
tags: [lepetitmonde/feature]
---

# Stories

Up: [[Feed]] · Code: `feed/_components/story_tray.tsx`, `story_viewer.tsx`, `create_story_modal.tsx`, `actions/stories.ts`, `story_highlights.ts`, `story_reactions.ts`

Short-lived photo or video stories shown as bubbles above the [[Feed]], in the style of Instagram.

- Admins post a story with a caption, an optional group label (stories with the same label share a bubble), circles and a duration: 24 h, 3 days, 7 days or never.
- Expired stories are pruned (`pruneExpiredStories`).
- **Highlights**: named, non-expiring collections. Adding a story to a highlight clears its `expires_at`.
- The viewer opens on the first unseen story, with tap zones (back / pause / next), hold to pause, and reactions.
- Admins can edit a story; adding a circle notifies only the newly visible members.
- The tray updates live through the [[Realtime]] relay.
- Story photos are copied into the [[Albums]] library.

Tables: `stories`, `stories_circles`, `story_views`, `story_reactions`, `story_highlights`, `story_highlight_items`. Notifications: `new_story`, `new_story_reaction`.
