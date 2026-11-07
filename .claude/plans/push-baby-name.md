# Baby name in push notifications

Status: implemented
Approved by:

## Goal
Members who follow several babies can't tell which baby a push is about: "New post" could be about any of them.
Every baby-scoped notification (push and in-app inbox) should name the baby. Each baby should also get its own
notification slot on the device, so a push about one baby doesn't replace a push about another.

## Out of scope
- Notifications that aren't tied to a baby: `bug_reports.ts` `notifyBugReportFixed` ("bug fixed") and
  `notifications.ts` `sendNotification` (the test push from settings and the admin "Notify"/"hello" ping).
  Both stay as they are.
- Per-recipient locale. The locale is set for the whole deployment (`resolveLocale()` reads `DEFAULT_LOCALE`)
  and stays that way.
- Any layout change to the header bell or a per-baby badge/filter in the inbox. Only the text of the stored
  title changes.
- Service worker changes. `src/worker/index.ts` and `public/sw.js` already pass `tag` and `url` through.
- Adding a test framework. The repo has none (no vitest/jest/playwright in `package.json`).
- New push types (for example timer start/stop). See "Overlap" below.

## Current state
- **One pipeline.** Every baby-scoped notification goes through `notifyUsers(babyId, type, {title, body, url}, targetUserIds)`
  in `src/utils/actions/notify.ts`. It is `server-only`, runs on the service-role client, and does this in order:
  1. reads opt-outs from `notification_preferences`;
  2. inserts `notifications` inbox rows (same title and body for every recipient);
  3. reads quiet hours from `notification_settings`;
  4. reads `push_subscriptions` (`id, subscription` only);
  5. sends one shared payload `{ title, body, url, tag: type }` to every device.
- **The tag is only the type.** On a device, a "New post" about baby A is silently replaced by a "New post" about
  baby B, and also by a second post about baby A.
- **Click URLs are already baby-scoped** at every call site (`/baby/${babyId}/...`). The service worker opens
  `data.url`. No change is needed there.
- **Baby name.** It is `babies.baby_surname` (string, NOT NULL), already read this way in `invite.ts` and
  `broadcast_email.ts`.
- **Inbox.** `getMyNotifications` returns rows from every baby, unfiltered, and `notification_bell.tsx` renders
  `notif.title` / `notif.body`. So the inbox has the same ambiguity.
- **Translations.** Callers translate title and body before calling `notifyUsers`, using the `pushNotifications`
  namespace in `messages/en.json` and `messages/fr.json`. `anecdotes-core.ts` and `events-core.ts` take an explicit
  `locale` because they are also called from MCP Route Handlers, which have no next-intl request context.

### Call sites (all unchanged by this plan except via `notifyUsers`)
| Type | File | Title (en) | Body (en) | URL |
|---|---|---|---|---|
| new_post | `src/utils/actions/posts.ts` (publishPost ~176, updatePost ~269) | New post | caption or "A new photo was added to the journal!" | `/baby/{id}/feed?postId=` |
| new_story | `src/utils/actions/stories.ts` (~119, ~195) | New story | "A new story was added to the journal!" | `/baby/{id}/feed?storyId=` |
| new_comment | `src/utils/actions/comments.ts` ~45 | New comment | "{name}: {body}" | `/baby/{id}/feed?postId=` |
| new_reaction | `src/utils/actions/reactions.ts` ~44 | New reaction | "{name} reacted {emoji} to your post" | feed?postId= |
| new_comment_reaction | `src/utils/actions/comment_reactions.ts` ~43 | New reaction | "...to your comment" | feed?postId= |
| new_story_reaction | `src/utils/actions/story_reactions.ts` ~43 | New reaction | "...to your story" | feed?storyId= |
| new_anecdote | `src/utils/anecdotes-core.ts` ~181 | New anecdote | content (120 chars) | `/baby/{id}/anecdotes` |
| new_life_stage | `src/utils/events-core.ts` ~168 | New milestone! | event title | `/baby/{id}/calendar` |
| new_pronostic | `src/utils/actions/guesses_questions.ts` (~110, ~332) | New pronostic | "A new pronostic is available!" | `/baby/{id}/guess` |
| new_member | `src/utils/actions/signup.ts` ~81, `join-baby.ts` ~67 | New member | "{name} joined the family!" | `/baby/{id}/admin` |
| circle_access_granted | `src/utils/actions/circles.ts` ~195 | Access granted | "You've been added to the "{circle}" group..." | `/baby/{id}/feed` |
| (not baby-scoped) bug fixed | `src/utils/actions/bug_reports.ts` ~145 | Le petit monde | "The bug you reported has been fixed..." | none |
| (not baby-scoped) test/admin ping | `src/utils/actions/notifications.ts` `sendNotification` ~310 | appName | free text ("hello") | none |

## Approach
All the logic goes in `notifyUsers`, so none of the 15 call sites change:

- **Title prefix.** Push and inbox title become `"{baby} · {title}"`, for example "Léa · New post" or
  "Léa · Nouvelle publication". The prefix goes on the title, not the body: Android/iOS truncate the body first, and
  a title prefix scans well in a stack of notifications.
- **Name rendering.** The name is trimmed and capped at 30 characters (with "…"). If the name is missing or the read
  fails, the title is sent unchanged (no prefix) and a `warn` is logged.
- **Recommended: show the name only when the recipient belongs to 2 or more babies.** That's the case it's meant
  for. Single-baby families (most of the ~20 users) keep today's short titles. The check runs per recipient at
  send time, so it switches on automatically as soon as someone joins a second baby.
- **Alternative: always show the name.** Slightly simpler, since it skips one query and the per-recipient split.
  It was not chosen because it adds noise for almost everyone. It is a one-line switch if the user prefers it
  (see open questions).
- **Inbox rows.** They store the same per-recipient title as the push. The bell lists every baby's notifications
  together, so it benefits too, with no UI change. Trade-off: the title is fixed at send time. If a user later joins
  a second baby, their older inbox rows stay unprefixed. This is acceptable.
- **Tag.** It becomes `${type}:${babyId}`. Pushes about different babies no longer replace each other. Pushes of the
  same type about the same baby still collapse, as they do today.
- **URL.** Unchanged, already baby-scoped.

**Alternative rejected**: passing the baby name from each caller. That means touching 15 call sites, which is easy to
forget for future types, and the "more than one baby" decision is per recipient anyway, which only `notifyUsers` knows.

## Data and migrations
- None. `babies.baby_surname` and `baby_access` already exist. No `database.types.ts` regeneration.

## Access and security
- No new route, action, export or table. `notifyUsers` stays a non-exported-from-`'use server'` `server-only`
  module (header comment unchanged).
- The two new reads use the service-role client that `notifyUsers` already uses:
  - `babies.baby_surname` for the `babyId` the caller already authorised;
  - `baby_access.user_id` for the recipients, which are already a trusted list computed from baby-scoped membership
    queries.
- Nothing about the recipient's *other* babies is revealed. Only a count is used. The name shown is the baby the
  recipient is already a member of.
- **Query cost**: 2 extra queries per `notifyUsers` call, no N+1.
  1. `babies.select('baby_surname').eq('id', babyId).maybeSingle()`
  2. `baby_access.select('user_id').in('user_id', recipientIds)`, counted per user in memory. At ~20 users, the
     whole table is tiny.

  Both run in `Promise.all` right after the opt-out filter.
- Devices query becomes `select('id, user_id, subscription')` so each device gets its owner's payload. That's the
  same rows and same client as today.

## Steps
Run `pnpm typecheck && pnpm lint` before each commit. Each commit is followed by its `CHANGELOG.md` commit.

1. **`fix(notifications): tag pushes per baby so they don't replace each other`**
   - Change the payload `tag` from `type` to `` `${type}:${babyId}` ``.
   - Files: `src/utils/actions/notify.ts`.
2. **`feat(notifications): prefix baby name for members of several babies`**
   - Files: `src/utils/actions/notify.ts`, `messages/en.json`, `messages/fr.json`.
   - **New helper.** Add a small pure helper in `notify.ts`:
     `formatBabyTitle(title, babyName, t)`. It returns `title` when `babyName` is empty after trim, and otherwise
     returns `t('babyTitle', { baby: capped(babyName, 30), title })`.
   - **Translator.** In `notifyUsers`, after computing `recipientIds`, get it with
     `getTranslations({ locale: resolveLocale(), namespace: 'pushNotifications' })`, using `resolveLocale` from
     `@/i18n/config`. Passing the locale explicitly means it works from both Server Actions and the MCP Route Handlers.
   - **Parallel reads.** In the same `Promise.all`, fetch the baby name and the recipients' `baby_access` user ids.
     Build `multiBaby = Set<userId>` for users with 2 or more rows.
     - On a baby-name error, call `contextLogger.warn(error, "Could not read baby name, sending unprefixed")` and
       continue.
     - On a `baby_access` error, log it and treat everyone as single-baby.
   - **Per-recipient title.** Compute `titleFor(userId)`. Use it in the `notifications` insert rows.
   - **Per-device payload.** Select `user_id` on `push_subscriptions` and build each device's payload with
     `titleFor(device.user_id)`. Body, url and tag are shared.
   - **Logging.** Extend the child logger context with `multiBabyCount` (no names in logs).
   - **Doc comment.** Update the comment above `notifyUsers` to mention the prefix rule.
3. **`docs(notifications): document baby-name prefix and per-baby tag`**
   - In `Notifications pipeline.md`, add a bullet "Baby name" covering the rule, fallback and inbox behaviour, plus
     a bullet "Tag" covering `type:babyId`.
   - In the flowchart, add a node between the inbox node and push for "title prefixed with baby name if recipient
     has ≥2 babies". Draw it before the inbox insert, since the inbox uses the same title.
   - Files: `docs/architecture/Notifications pipeline.md`.
   - Don't add a new feature note: this is a pipeline behaviour, not a feature.

## Translations
- `pushNotifications.babyTitle`:
  - en: `"{baby} · {title}"`
  - fr: `"{baby} · {title}"`

  The format can differ per locale later without code changes.

## Design
No layout change: only the text of push titles and inbox titles changes. The designer isn't needed. Run the
designer only if the user wants a per-baby visual cue in the bell later.

## Overlap
- `.claude/plans/baby-scoped-timers.md` explicitly keeps push out of scope ("`notify.ts` stays as it is"), so there
  is no conflict.
- If a timer push is added later, it goes through `notifyUsers` and gets the baby prefix and per-baby tag
  automatically.

## Risks and open questions
All resolved (approved by the user):
1. **Conditional vs always: resolved.** Prefix only for recipients who belong to 2 or more babies.
2. **Tag collapse within one baby: resolved.** Tag stays `${type}:${babyId}`; same type and same baby still collapses.
3. **Admin "Notify"/"hello" ping: resolved.** Stays without a baby name.
4. **Old inbox rows** keep their unprefixed titles. There is no backfill.

## How to verify
No automated tests exist. Verify manually on a phone with push enabled (installed PWA on iOS):
1. **User in 2 babies (A "Léa", B "Tom"), test 1.** An admin publishes a post in A, then one in B.
   - Two separate notifications show "Léa · New post" and "Tom · New post". Neither replaces the other.
   - Tapping each opens `/baby/<A or B>/feed?postId=…`.
   - The bell shows both prefixed titles.
2. **Same user, test 2.** Publish two posts in A. The second replaces the first on the device (same `new_post:A`
   tag). The inbox has both rows.
3. **User in only baby A.** A post in A arrives as "New post", with no prefix, in both push and inbox.
4. **Other types.** Repeat for one comment, one reaction and one milestone (`new_life_stage`). For the MCP path,
   create an anecdote via the MCP tool to confirm the explicit-locale translator works outside a request.
5. **User without access.** A member of B only gets nothing for posts in A. That's unchanged, but confirms the
   new `baby_access` read didn't widen the recipient list.
6. **Not baby-scoped.** Mark a bug report fixed and send the settings test push. Titles are unchanged ("Le petit
   monde" / appName).
7. **Logs.** Pino logs show `multiBabyCount` and no `console.log`. Temporarily point to a non-existent baby name
   (or simulate an error) and check that the push still goes out unprefixed, with a `warn` logged.
