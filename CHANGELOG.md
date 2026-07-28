# Changelog

Every commit on `main`, newest first, grouped by date. Generated from `git log`.

## 2026-07-28

- `16a4468` Add Gazette digest email template and sender
- `2edab79` Extract pure post-visibility filter, add session-independent range query
- `b0b239c` Add Gazette and Gazette monetization implementation plans

## 2026-07-26

- `4e8d9ba` Regenerate database types after applying the RLS helper functions migration
- `bbfdcaf` Add RLS helper functions: is_baby_member, is_baby_admin, is_circle_visible, shares_baby_with
- `e5e49fd` Move cross-user notification writes/reads onto the service-role client
- `b1a7a7b` Fix docker_tag_prod: buildx imagetools fails TLS on this HTTP registry
- `a7cb5a9` Rework calendar event types: occasion, life_stage, medical
- `02a0989` Document the :prod tag promotion workflow
- `8b6c24a` Report Core Web Vitals to /api/vitals for Pino logging
- `95c1091` Log server-side timing for feed load, media proxy, and uploads
- `3bfa17f` Cap app container memory/CPU so it can't starve the rest of the stack
- `b8b17a9` Cap HEIC upload size to bound worst-case decode memory
- `eece04b` Cache getAuthUser's GoTrue verification for a few seconds
- `4cbb280` Cache getUserAccess/getNicknamesByBaby for a few seconds
- `e0688ac` Cache post media indefinitely in the browser, not just for an hour
- `df4ff53` Batch per-post comment/reaction/poll/view fetches instead of one-per-card
- `47730b5` Stream media proxy instead of buffering whole files in memory

## 2026-07-24

- `ba5c04a` Fix comment author name showing legal name instead of nickname
- `0de25ff` Add user settings: edit profile/email/password, per-baby nickname/relation/notifications
- `98c3718` Move nickname from users to baby_access (per-baby nicknames)
- `58e8566` Note next/image tradeoffs on the image-priority idea
- `b424260` Note idea: prioritize loading images closest to the viewport
- `0d2c892` Mark quirk 1 fixed, flag unverified realtime publication membership
- `81321be` Fix realtime users list never updating live (wrong filter column)
- `89fc4d3` Mark quirk 4 fixed: invite-by-email now sends an email
- `b80a148` Send an actual email when inviting a member by email
- `fbd50e5` Mark quirks 0, 2, 5, 6 fixed; document the proxy.ts location bug
- `263c6b8` Redirect back to the originating page after login
- `73315e6` Exclude /api from the proxy matcher, keep route handlers as the auth gate
- `ac24aa1` Remove dead isAdmin field from getBaby()
- `cd20877` Archive shipped doudou-reactions and polls plans to done/
- `e581f93` Update CHANGELOG.md for 4aac6e1 and 888680c
- `888680c` Add project overview documentation
- `08c76e8` Update CHANGELOG.md for 882ff1a
- `ebf8ecf` Update CHANGELOG.md for aec8faa
- `4aac6e1` Mark fixed findings in the security review and quirks plans
- `882ff1a` Reject expired invitation links at signup
- `aec8faa` Require baby membership before commenting, reacting, viewing, or voting
- `c566e4d` Require a CHANGELOG.md update after every commit
- `f31cb88` Include the commenter's name in new comment notifications
- `c300be0` Notify only admins on new comments, not all circle members
- `8b98f77` Let admins review bug reports and notify reporters when fixed
- `429671e` Show submitted bug reports on the admin page
- `038bf96` Truncate long name lists in reaction/view popovers
- `3d8f25d` Add a per-post statistics modal for admins
- `7888971` Restrict the seen-by report to admins
- `d3f8196` Track and display per-post view counts on the journal
- `9c51c05` Trim landing page to 3 pages and add a how-it-works section
- `bd5f55d` Notify members when added to a circle, show pending state on journal
- `c173286` Regenerate CHANGELOG.md after the LICENSE root-commit rebase
- `1459d05` Add license section to README
- `d9be73a` Move welcome-email from-address to an env var
- `2dcf9da` Show commit changelog in a dialog from the version footer
- `7164e61` Document self-hosted Supabase setup instead of vendoring docker/
- `6dbaacb` Read VAPID contact email from env instead of hardcoding it

## 2026-07-23

- `d5ec0fe` Add poll voting UI and server actions to feed posts
- `2c213a3` Add polls schema for post-level sondages
- `a52b074` Prefer nickname over first/last name for comment and reaction authors
- `37ad200` Show member info and device-aware notify control on admin members list
- `d1895da` Add prev/next month indicators for events and posts outside the visible range
- `a28c2b1` Fix image glitch on fast scroll in feed by using thumbnails and paint containment
- `78c10e4` Add circle badges to posts for admins
- `92f85d2` Add show/hide toggle to password fields
- `d840eb8` Make the iOS install instructions explicit, step by step
- `87158f8` Show the install-app card wherever push isn't supported yet
- `fa5c4d0` Add a notification opt-in step to onboarding
- `c07ff24` Split quiet hours into two rows to stop popover horizontal scroll
- `5a556a6` Reuse the pronostic time picker for quiet hours
- `d91a620` Nudge users to enable push notifications via a sonner toast
- `7a27104` Fix Docker build failing on module-load web-push VAPID configuration
- `f7c6ec8` Mark the notification system plan as implemented
- `de72d37` Require a shared admin relationship to push-notify another user
- `6bf3ee1` Wire notification triggers into activity that generates them
- `4d35994` Add the notification bell popup panel to the header
- `68b6f09` Add in-app notification inbox and the central send pipeline
- `9d8f6e5` Add notification preferences and quiet hours
- `1f3a3e4` Fix push_subscriptions for real multi-device support
- `6ec2b99` Add implementation plan for the notification system
- `9583e6f` Send welcome email from a reply-able root-domain address
- `352269e` Fix Docker build failing on module-load Resend construction
- `b5dbc13` Restyle auth email templates to match the app's landing branding
- `4655710` Send a welcome email via Resend after signup

## 2026-07-22

- `8560fd6` Rename "carnet" to "journal" throughout the app copy
- `9a043f7` Show per-emoji reaction breakdown with reactor names on posts
- `a1a0848` Fix auth confirm redirects and log verifyOtp failures
- `8e63bd2` Add French templates for the remaining Supabase Auth email types
- `080017d` Build the recovery email link against the app's own domain
- `ff15b88` Add French password-recovery email template for Supabase Auth
- `0da9f0c` Switch app logo to SVG and drop unused Next.js template assets
- `e1764da` Add custom Doudou emoji reactions to replace the single like heart
- `6ce0678` Let users edit or delete their own comments
- `53d276c` gitignore
- `87ef89c` gitignore
- `e22992c` Add a bug report button with automatic screenshot capture
- `77ca668` Zoom the PWA/app icons and match their background to the site
- `5badcbe` Use video poster for calendar day-cell thumbnails
- `17fac7e` Generate a poster thumbnail for uploaded videos
- `8547527` Let admins edit a post's caption, date, and visibility
- `e863785` Add docker-compose file for the cloudflared tunnel
- `e7ef540` Document plan lifecycle and archive shipped plans to done/
- `c98f462` Let admins set answer type when reviewing a proposed pronostic
- `70d78c1` Show "propose a pronostic" action in the all-guessed empty state
- `44f4226` Rebuild guess time picker with 24h hour/minute dropdowns
- `f5dd93b` Show a count badge on calendar days with multiple publications
- `b279f05` Add ability to reorder pronostics in admin view
- `33e7b9e` Fix favicon.ico to use RGBA PNG frames
- `9c024f6` Update PWA icons and app name to Le petit monde
- `4206dda` Close modals when clicking outside their content panel
- `d3983c6` Sort journal posts by the photo date instead of upload timestamp
- `a33379e` Fix pronostic creation modal backdrop not covering the full page
- `07a7b3f` Merge journal posts into the calendar day view
- `832d5d7` Add onboarding flow for new baby journal members
- `bfae924` Fix color seam between landing background and page background
- `8f5e7c9` Reorder the header nav to Journal, Calendrier, Pronostics, Administration
- `fa76a9d` Truly center the page-selector nav in the header
- `7182f16` Apply the landing background to the /profile stub page
- `4cd4ef8` Restyle the settings page to match the book theme
- `9ea6f43` Restyle the pronostics admin page to match the book theme
- `62d75fe` Restyle the journal (feed) page to match the book theme
- `817e5e2` Restyle the calendar page to match the book theme
- `1d0fc54` Restyle the admin (circles & access) page to match the book theme
- `97872e1` Restyle the forgot/reset-password pages to match the book theme
- `fdd8da4` Restyle the signup page and fix its broken placeholder image
- `200398f` Finish login page redesign: shared auth layout and card
- `f196391` Restyle the pronostics page to match the book theme
- `f9dd071` Rename chapter to page across the book-themed pages
- `9a6fd15` Fix mismatched copy on the baby-picker page
- `15fc182` Restyle the baby-picker page to match the book theme
- `9b83f19` Redesign the per-baby menu page around the book/chapter theme
- `d001e66` Fix logo transparency lost through Next's image optimizer
- `1649ba8` Show the logo mark in the site header
- `53c9129` Fix login page scroll and mismatched background
- `3682f1a` Add public landing page for logged-out visitors, built around the new logo

## 2026-07-21

- `0b157ee` Update favicon and app icons from new design
- `c6276b6` Add pull-to-refresh gesture to the app (Facebook/Instagram style)
- `6a04802` Allow pinch-to-zoom and double-tap zoom on lightbox photos
- `8420314` Disable pinch/double-tap zoom on pages
- `a1c61e8` Render videos in the journal feed and lightbox
- `3321819` Add mime_type to post_photos for video support
- `10a0ac8` Add full-screen photo lightbox with carousel navigation
- `06b9140` Fix post_photos rows not being created after upload
- `7ab6609` Convert HEIC/HEIF photo uploads to JPEG for cross-browser compatibility
- `a1a855d` Fix calendar month navigation showing wrong month behind UTC timezones
- `c5df22c` Fix mixed-content image loading by proxying storage downloads through the app
- `de2194a` Add pronostic editing and number calibration/precision options
- `e9793b8` Fix storage RLS blocking photo upload, read, and delete
- `74cbff8` Stream post uploads through a route handler to support 500MB videos
- `92c0636` Raise Server Action body size limit for photo uploads
- `2324eab` Fix baby bucket creation failing RLS policy
- `418da43` Fix single-choice question labeling and let admins delete unanswered questions
- `ca951b4` Add feed feature: server actions, pages, and components
- `57f83a6` Add posts/post_photos/post_reactions/post_comments migration
- `8bb2385` Add calendar link to baby landing page
- `de26916` Add error feedback and delete confirmation to calendar modals
- `27f4a9c` Mark calendar plan as implemented, document deviations
- `9dea02b` Add calendar page and enable nav entry
- `65dc6aa` Add event server actions
- `4904789` Add events and events_circles tables
- `07d1a92` Add typecheck script
- `9e8ef6d` Document mise exec requirement for ad hoc database commands
- `d2a34d3` Document calendar plan prerequisites checklist
- `e270472` Plan calendar and feed features, document plan storage convention
- `4ef743c` Add Supabase CLI-based database migration workflow
- `2d1d8f7` Allow non-admins to propose guess questions for admin review
- `ef2fb11` Remove baby selector from header
- `da26c6d` Switch guess questions layout to CSS masonry grid
- `ac4910c` Translate remaining UI text to French
- `c042192` Fix broken PWA service worker, notification icons, and add install prompt
- `ec5bd30` Rename app title from Journal de Bébé to Le petit monde
- `a1f43ad` Allow admins to change a member's access level in the admin page
- `e23a81c` Rename circles page to admin and add circle membership management
- `a3ec2ce` Add "option" pronostic type with admin-defined predefined choices
- `bedf6bc` Remove type badge from pronostic cards
- `57dcdd5` Restyle pronostics page header to match baby landing page
- `9fc3b44` Dedupe auth.getUser() calls per request with React cache()
- `817de6d` Move Storage uploads to a Server Action
- `416ca15` Relay Realtime updates through the Next.js server via SSE
- `8d26915` Stop shipping Supabase URL/key to the browser bundle
- `aa318f9` Add mise docker_build_push task and show build commit in footer
- `2e8d831` Show everyone's answers per pronostic on the admin page
- `7fb5f70` Add admin page to manage pronostics, drop the button from the main page

## 2026-07-20

- `26474db` Capitalize baby name in header title and drop the selector's duplicate label
- `030c43f` Build a real landing page for a selected baby
- `6e91009` Rebuild home page in the Veille visual identity
- `e3f3d61` Retint the app to the warm Veille palette
- `6c5ce14` Hide baby selector on the landing page
- `242f09b` Build styled home/landing page listing accessible babies
- `f2a4d7f` Rewrite baby selector on Shadcn Select and fix crash/label bugs
- `12de81e` Fix baby-selector redirecting away from non-baby routes
- `6958714` Build styled settings page with account, notifications and install sections
- `68b2090` Enforce admin-only access on circles page and add invite link history
- `acb6623` Fix mobile menu crash and admin-only 404 on Calendrier link
- `aae6f93` Make header and modal responsive on mobile
- `3fa19c1` Wire up dark theme support
- `b640151` Claude docker
- `9f0ee04` Fix calendar hydration mismatch on data-day attribute
- `a8bac90` Document mise usage and git workflow in CLAUDE.md
- `f1840bc` Claude type
- `04ad2bd` Claude slider
- `d04ce03` Claude multiple guess
- `12a1536` Claude autorization issues
- `31cc69c` Claude resetpwd
- `68bb5bc` Claude auth

## 2026-07-16

- `5dfc139` asd
- `65b9dd0` testing

## 2026-07-14

- `bd74908` page selector

## 2026-07-12

- `1951ba9` ui circles
- `7beba5d` testing
- `29f5147` update pronostic ui
- `89d73ad` before ai

## 2026-07-11

- `42a4bb2` guess ish
- `eaf845d` notification
- `beb3641` start notif

## 2026-07-10

- `0baea04` bordel

## 2026-07-09

- `3e4fe55` rename
- `94e1639` moving

## 2026-07-05

- `bddb127` init
- `1cc030d` Add PolyForm Noncommercial License
