# Changelog

Every commit on `main`, newest first, grouped by date. Generated from `git log`.

## 2026-07-23

- `31e7cef` Add poll voting UI and server actions to feed posts
- `7f2d49f` Add polls schema for post-level sondages
- `7c932f0` Prefer nickname over first/last name for comment and reaction authors
- `f577ea8` Show member info and device-aware notify control on admin members list
- `7dc1d19` Add prev/next month indicators for events and posts outside the visible range
- `353f9c5` Fix image glitch on fast scroll in feed by using thumbnails and paint containment
- `3dd2230` Add circle badges to posts for admins
- `61f4204` Add show/hide toggle to password fields
- `a10666f` Make the iOS install instructions explicit, step by step
- `cf75d87` Show the install-app card wherever push isn't supported yet
- `6071d54` Add a notification opt-in step to onboarding
- `cd82efb` Split quiet hours into two rows to stop popover horizontal scroll
- `b56622a` Reuse the pronostic time picker for quiet hours
- `f4e77cd` Nudge users to enable push notifications via a sonner toast
- `03a4daa` Fix Docker build failing on module-load web-push VAPID configuration
- `ba80f32` Mark the notification system plan as implemented
- `910a34d` Require a shared admin relationship to push-notify another user
- `e277bdf` Wire notification triggers into activity that generates them
- `afe4e2c` Add the notification bell popup panel to the header
- `0be9d8f` Add in-app notification inbox and the central send pipeline
- `9129329` Add notification preferences and quiet hours
- `acf9454` Fix push_subscriptions for real multi-device support
- `9d8a562` Add implementation plan for the notification system
- `53679c5` Send welcome email from a reply-able root-domain address
- `1876e85` Fix Docker build failing on module-load Resend construction
- `25893e0` Restyle auth email templates to match the app's landing branding
- `6442818` Send a welcome email via Resend after signup

## 2026-07-22

- `ff3d6c4` Rename "carnet" to "journal" throughout the app copy
- `f336af7` Show per-emoji reaction breakdown with reactor names on posts
- `08c3abd` Fix auth confirm redirects and log verifyOtp failures
- `4a3f643` Add French templates for the remaining Supabase Auth email types
- `b19f9f4` Build the recovery email link against the app's own domain
- `92ccb16` Add French password-recovery email template for Supabase Auth
- `1d5a772` Rename resend_api to RESEND_API_KEY for env var convention
- `352b7b7` Switch app logo to SVG and drop unused Next.js template assets
- `1da7997` Add Resend API key to mise env
- `6032e54` Add custom Doudou emoji reactions to replace the single like heart
- `b060960` Let users edit or delete their own comments
- `7351a38` gitignore
- `5ba6ddf` gitignore
- `b0e0e36` Add a bug report button with automatic screenshot capture
- `e2b5ab8` Zoom the PWA/app icons and match their background to the site
- `ef4b5cd` Use video poster for calendar day-cell thumbnails
- `cecfea6` Generate a poster thumbnail for uploaded videos
- `cc6a234` Let admins edit a post's caption, date, and visibility
- `66a8e96` Add docker-compose file for the cloudflared tunnel
- `36e3e10` Point CLAUDE_CONFIG_DIR at the personal config dir via mise
- `7205b08` Document plan lifecycle and archive shipped plans to done/
- `cd70436` Let admins set answer type when reviewing a proposed pronostic
- `83ab2c9` Show "propose a pronostic" action in the all-guessed empty state
- `fb41e3b` Rebuild guess time picker with 24h hour/minute dropdowns
- `3d010fe` Show a count badge on calendar days with multiple publications
- `223a0d6` Add ability to reorder pronostics in admin view
- `45bce07` Fix favicon.ico to use RGBA PNG frames
- `cda70ad` Update PWA icons and app name to Le petit monde
- `83940de` Close modals when clicking outside their content panel
- `803929b` Sort journal posts by the photo date instead of upload timestamp
- `e4fd00b` Fix pronostic creation modal backdrop not covering the full page
- `cc45f5c` Merge journal posts into the calendar day view
- `dbb9684` Add onboarding flow for new baby journal members
- `fa375e7` Fix color seam between landing background and page background
- `b3fb8b6` Reorder the header nav to Journal, Calendrier, Pronostics, Administration
- `85a5706` Truly center the page-selector nav in the header
- `affdd4b` Apply the landing background to the /profile stub page
- `16ad26b` Restyle the settings page to match the book theme
- `0152f71` Restyle the pronostics admin page to match the book theme
- `572e1fb` Restyle the journal (feed) page to match the book theme
- `c933999` Restyle the calendar page to match the book theme
- `3b00059` Restyle the admin (circles & access) page to match the book theme
- `367f897` Restyle the forgot/reset-password pages to match the book theme
- `05d82aa` Restyle the signup page and fix its broken placeholder image
- `88916a0` Finish login page redesign: shared auth layout and card
- `1f52d5f` Restyle the pronostics page to match the book theme
- `727c5ba` Rename chapter to page across the book-themed pages
- `1ecc9fb` Fix mismatched copy on the baby-picker page
- `1e13dc3` Restyle the baby-picker page to match the book theme
- `18e1eb6` Redesign the per-baby menu page around the book/chapter theme
- `246c01f` Fix logo transparency lost through Next's image optimizer
- `0d85721` Show the logo mark in the site header
- `3a59425` Fix login page scroll and mismatched background
- `67d0e6c` Add public landing page for logged-out visitors, built around the new logo

## 2026-07-21

- `9154856` Update favicon and app icons from new design
- `a5a806e` Add pull-to-refresh gesture to the app (Facebook/Instagram style)
- `fabac26` Allow pinch-to-zoom and double-tap zoom on lightbox photos
- `46f9366` Disable pinch/double-tap zoom on pages
- `2dfce52` Render videos in the journal feed and lightbox
- `6cb3ddf` Add mime_type to post_photos for video support
- `d633493` Add full-screen photo lightbox with carousel navigation
- `35d512b` Fix post_photos rows not being created after upload
- `aa3fb5f` Convert HEIC/HEIF photo uploads to JPEG for cross-browser compatibility
- `9713a49` Fix calendar month navigation showing wrong month behind UTC timezones
- `53160fc` Fix mixed-content image loading by proxying storage downloads through the app
- `a63251f` Add pronostic editing and number calibration/precision options
- `c581812` Fix storage RLS blocking photo upload, read, and delete
- `7810535` Stream post uploads through a route handler to support 500MB videos
- `4312af6` Raise Server Action body size limit for photo uploads
- `db18685` Fix baby bucket creation failing RLS policy
- `9d64905` Fix single-choice question labeling and let admins delete unanswered questions
- `93cff09` Add feed feature: server actions, pages, and components
- `6c7bef5` Add posts/post_photos/post_reactions/post_comments migration
- `91e9592` Add calendar link to baby landing page
- `3216163` Add error feedback and delete confirmation to calendar modals
- `b6e4d99` Mark calendar plan as implemented, document deviations
- `33445e0` Add calendar page and enable nav entry
- `15eab2f` Add event server actions
- `9ad529a` Add events and events_circles tables
- `9081dfb` Add typecheck script
- `60bf877` Document mise exec requirement for ad hoc database commands
- `2b7e5f3` Document calendar plan prerequisites checklist
- `ed761e4` Plan calendar and feed features, document plan storage convention
- `0780dee` Add Supabase CLI-based database migration workflow
- `aaec6be` Allow non-admins to propose guess questions for admin review
- `5be7ffd` Remove baby selector from header
- `7a4ee2c` Switch guess questions layout to CSS masonry grid
- `b469ef8` Translate remaining UI text to French
- `4fa6eb0` Fix broken PWA service worker, notification icons, and add install prompt
- `0dbe6f3` Rename app title from Journal de Bébé to Le petit monde
- `9d91384` Allow admins to change a member's access level in the admin page
- `03dce6a` Rename circles page to admin and add circle membership management
- `53849a0` Add "option" pronostic type with admin-defined predefined choices
- `c96764d` Remove type badge from pronostic cards
- `fbf603b` Restyle pronostics page header to match baby landing page
- `08c545a` Dedupe auth.getUser() calls per request with React cache()
- `0955eea` Move Storage uploads to a Server Action
- `fd8ac48` Relay Realtime updates through the Next.js server via SSE
- `d098b19` Stop shipping Supabase URL/key to the browser bundle
- `544cdbd` Add mise docker_build_push task and show build commit in footer
- `97722fe` Show everyone's answers per pronostic on the admin page
- `7df2817` Add admin page to manage pronostics, drop the button from the main page

## 2026-07-20

- `7730bd9` Capitalize baby name in header title and drop the selector's duplicate label
- `e2a2aee` Build a real landing page for a selected baby
- `f88e2d3` Rebuild home page in the Veille visual identity
- `3538ea9` Retint the app to the warm Veille palette
- `3b093ec` Hide baby selector on the landing page
- `62fa2ce` Build styled home/landing page listing accessible babies
- `87e87a4` Rewrite baby selector on Shadcn Select and fix crash/label bugs
- `b693978` Fix baby-selector redirecting away from non-baby routes
- `c2024b2` Build styled settings page with account, notifications and install sections
- `18bd4fb` Enforce admin-only access on circles page and add invite link history
- `7d08877` Fix mobile menu crash and admin-only 404 on Calendrier link
- `0d00e63` Make header and modal responsive on mobile
- `6db78b4` Wire up dark theme support
- `0bfab66` Claude docker
- `f8d332b` Fix calendar hydration mismatch on data-day attribute
- `046d839` Fix Supabase env var name in mise.toml
- `e5e309b` Document mise usage and git workflow in CLAUDE.md
- `08bbd05` Claude type
- `ad3631c` Claude slider
- `7739b7a` Claude multiple guess
- `39ad015` Claude autorization issues
- `5f319c9` Claude resetpwd
- `b5cd9a7` Claude auth

## 2026-07-16

- `8453846` asd
- `02d65da` testing

## 2026-07-14

- `3fd2f4e` page selector

## 2026-07-12

- `3423cba` ui circles
- `f3b83ee` testing
- `d0ef375` update pronostic ui
- `8b69aab` before ai

## 2026-07-11

- `670958c` guess ish
- `d935eb4` notification
- `0686b13` start notif

## 2026-07-10

- `ba03340` bordel

## 2026-07-09

- `5db3fd8` rename
- `c5cf287` moving

## 2026-07-05

- `a9a91ba` init
