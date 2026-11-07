---
tags: [lepetitmonde/feature]
---

# Admin console

Up: [[Le petit monde]] · Route: `/baby/[babyId]/admin` ("Cercles & accès") · Code: `admin/_components/`

Admin-only management for one baby:

- **Invitations**: create single-use links valid 24 h / 3 days / 7 days, or send them by email; see status (pending, used, expired, revoked) and revoke. See [[Authentication]].
- **Circles**: create circles and manage their members ([[Authorization]]).
- **Access by group**: which [[Albums]] each circle can see.
- **Members**: list members, change `admin` / `viewer` (the last admin can't be demoted), send a test push.
- **Pages**: enable or disable pages and set the required role ([[Page settings]]).
- **Broadcast email**: send an email to the members of chosen circles ([[Notifications pipeline]]).
- **Bug reports**: review reports and move them `new` → `reviewed` → `fixed` ([[Bug reports]]).

Member and circle lists update live ([[Realtime]]).
