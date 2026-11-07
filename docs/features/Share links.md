---
tags: [lepetitmonde/feature, security]
---

# Share links

Up: [[Albums]] · Routes: `/share/[token]`, `/api/share/[token]/[photoId]` · Code: `album-share.ts`, `share-token.ts`, `actions/shares.ts`

Admins share one photo, a hand-picked selection (up to 100 photos) or a whole album with people who have **no account**.

- The link carries a random 256-bit token, shown **once**. Only its sha256 is stored.
- Expiry: 24 h, 7 days, 30 days, or "opens once" (consumed on the first human visit; link-preview bots don't consume it). No "never".
- Admins can revoke a link at any time.
- Each page open is logged (`album_share_accesses`: time, IP, browser), visible to admins per link, kept 90 days.
- The public page and photo route run on the service role and scope every read by hand to that share's photos. No baby id, storage path or creator id reaches the visitor.

Tables: `album_shares`, `album_share_photos`, `album_share_accesses` (RLS on, see [[Row Level Security]]). Security context: [[Security model]].
