# Pronostic results, leaderboard and funny answers

## Status: implemented

Shipped 2026-10-06: per-question resolution with automatic scoring (3/0 exact, 3/2/1 closest-wins with shared ranks), free-text auto-match + admin override, funny flags (badge only), `/baby/[babyId]/guess/leaderboard`, resolved state + podium place on the member card, and hardening of `submitGuess` / `getAllGuesses`.

Deviations:
- Reviewer round 2 fixes: date distances compared in whole days (DST-safe), number distances rounded to 1e-6, time distance wraps midnight, text normalization collapses spaces/hyphens/apostrophes, member guess payload no longer carries `is_funny`/`is_correct`, 500-char cap on text answers, stable funny-toggle label.
- `guess_questions.correct_answer` / `resolved_at` already existed on the live DB from the unmerged `worktree-pronostics-leaderboard` branch (`20260919142433_add_guess_question_resolution.sql`). That file was restored verbatim on main, and `20261006140151_guess_results.sql` only adds `guesses.is_correct` / `is_funny`. That branch is now superseded for its leaderboard parts.
- `mise run db_push` kept failing with a TLS error; `mise exec -- bash -c 'pnpm supabase db push --debug --db-url …'` worked.
- Time answers now display in locale format; `guess.leaderboard.pointsUnit` added; `guess.admin.funny.unflag` removed.
- Follow-ups: CalendarPicker Aug–Dec 2026 range; optional `answerTooLong` error key.

Approved by: owner (2026-10-06)

Owner request (verbatim): "I want to be able to validate the guess of the user
and maybe have a leader board page. Would be nice that we can flag the funny
answer or something like that."

## Assumptions to confirm before approval

These are the decisions this plan makes on the owner's behalf. Each one is
cheap to flip now and annoying to flip later. (The owner has since answered
the open questions; see "Risks and open questions". All answers match these
assumptions.)

1. **Admin enters the real answer per question; scoring is automatic**,
   rather than the admin ticking every guess by hand. Free-text questions are
   the exception: they get an automatic normalized match plus a manual
   correct/incorrect override per guess.
2. **Scoring (computed at read time, nothing stored):**
   - `option`: 3 pts if the guess equals the correct choice, else 0.
   - `text`: 3 pts if correct (admin override, otherwise normalized match:
     trimmed, case-insensitive, accent-insensitive), else 0.
   - `number` / `date` / `time`: "closest wins" podium. Rank guesses by
     absolute distance to the real value: 1st = 3 pts, 2nd = 2 pts,
     3rd = 1 pt, everyone else 0. Equal distances share a rank and get the same
     points (competition ranking: 1, 1, 3).
3. **Results are revealed per question, as soon as the admin sets the
   answer.** No global "reveal party" switch. (Alternative in open question 1.)
4. **A resolved question is closed.** Nobody can submit a new guess on it
   (otherwise late guessers could copy the answer from the leaderboard).
5. **"Funny" is an admin-only flag on a guess.** It does not give points. Funny
   answers appear in a "Funniest answers" section on the leaderboard, and each
   member's funny count shows as a badge next to their name. Funny answers on
   unresolved questions are **not** shown to members yet, so they can't leak
   answers before the question closes.
6. **Leaderboard is visible to every member who can open the Pronostics page**
   (same `assertPageAccess(babyId, 'guess')` gate). It only counts resolved
   questions. Before anything is resolved it shows an empty state.
7. **Ties on the leaderboard share a rank, with no tie-break** (1, 1, 3).
8. **No push notification** when results are published (can be added later
   with the existing `notifyUsers` helper).

## Goal
Let a baby's admins record the real outcome of each pronostic (name, weight,
birth date...) so guesses are validated and scored automatically, show every
family member a leaderboard of who guessed best, and let admins flag the
funniest answers so they get their own moment on that page.

## Out of scope
- Configurable points per question or per type (fixed rules above).
- A global "hide all results until reveal" switch (see open question 1).
- Push/email notification when a question is resolved.
- Editing or re-opening a guess for a user (guesses stay immutable).
- Member voting on funny answers (admin-only flag).
- Database-level RLS: no table in this app has RLS today; tracked separately
  in `.claude/plans/rls.md`, which should pick up the new columns when it
  ships.
- Realtime updates of the leaderboard (a page load or `router.refresh()` is
  enough for ~20 users).

## Current state
- **Tables** (`supabase/migrations/20260721132707_baseline.sql`,
  `20260722190622_add_guess_questions_position.sql`):
  - `guess_questions` (`baby_id`, `id`, `type` varchar, `options` jsonb,
    `is_active` boolean (written but never read), `title`, `description`,
    `status` `pending|approved|rejected`, `created_by`, `position`).
  - `guesses` (`id`, `user_id`, `question_id`, `baby_id`, `answer` jsonb,
    `created_at`). PK is `(user_id, question_id)`: one guess per user per
    question, immutable once submitted.
  - No RLS anywhere. Tables are `GRANT ALL`, and access is enforced in server
    actions with `getUserAccess` / `assertIsAdmin`.
- **Answer shapes stored in `guesses.answer`**, from
  `src/app/baby/[babyId]/guess/question_wrapper.tsx` and `_components/picker/*`:
  - `text`: string. `option`: the chosen choice string from
    `options.choices`.
  - `number`: usually a **string** (the `NumberPicker` input sends
    `e.target.value`; the slider may send a number). Always parse with
    `Number()`.
  - `date`: `Date.toISOString()` of the picked local date.
  - `time`: `"HH:mm"` string. The `time` type is supported by the wrapper but
    can't currently be created from the modal (`modal.tsx` only offers
    text/date/number/option). Scoring handles it anyway.
- **Roles**: `Enums<'role'>` = `admin | viewer`, held in
  `baby_access.access_level`.
- **Actions**:
  - `src/utils/actions/guesses.ts`: `submitGuess`, `getGuesses`
    (unused, not baby-scoped), `getAllGuesses(babyId)` (member check only, but
    only the admin page uses it), `deleteGuess` (admin).
  - `src/utils/actions/guesses_questions.ts`: question CRUD, review, reorder,
    `getQuestionsWithGuess` / `getQuestionsWithoutGuess`.
- **Pages**:
  - `src/app/baby/[babyId]/guess/page.tsx`: member view with "To guess" and
    "My pronostics" tabs (`guesses_tabs.tsx`, `question_wrapper.tsx`). Members
    only ever see their **own** guesses.
  - `src/app/baby/[babyId]/guess/admin/page.tsx`: admin view listing every
    guess per question with a delete button (`admin/_components/*`). This is
    the screen to extend for validation and funny flags.
- **i18n**: next-intl, `messages/en.json` + `messages/fr.json`, `guess.*`
  namespace; server errors go through `actionError(key)` →
  `serverErrors.*`.
- **Migrations / types**: `mise run db_migration_new <name>`,
  `mise run db_push`, `mise run update_types` (all in `mise.toml`).

**CLAUDE.md drift noted**: CLAUDE.md says `app/project/[projectId]/...`,
`app/actions/...` and `@/utils/supabase/client`. The real routes are
`src/app/baby/[babyId]/...`, actions live in `src/utils/actions/`, and there is
no browser Supabase client. This plan follows the code.

## Approach
Add four nullable/defaulted columns: the correct answer and resolution time on
`guess_questions`, plus a manual verdict and a funny flag on `guesses`.
Compute points at read time in one pure scoring module. Nothing derived is
stored, so deleting a guess, fixing an answer or overriding a verdict can't
leave scores stale. With ~20 users and a few dozen questions the computation
is trivial. Admins validate from the existing admin page. A new server-rendered
`/baby/[babyId]/guess/leaderboard` route shows rankings and funny answers.

Alternative considered: storing `points` on each guess at resolve time. Not
chosen because "closest wins" depends on every other guess, so any delete or
override would mean re-scoring the whole question, which is easy to forget.

## Data and migrations
New migration `supabase/migrations/<timestamp>_guess_results.sql` (create via
`mise run db_migration_new guess_results`). Additive only, nothing destructive:

```sql
ALTER TABLE "public"."guess_questions"
  ADD COLUMN "correct_answer" jsonb,
  ADD COLUMN "resolved_at" timestamptz;

ALTER TABLE "public"."guesses"
  ADD COLUMN "is_correct" boolean,              -- null = automatic; true/false = admin override (text questions)
  ADD COLUMN "is_funny" boolean NOT NULL DEFAULT false;
```

- `resolved_at IS NOT NULL` means the question is closed and its results are
  public. `correct_answer` uses the same JSON shape as `guesses.answer` for
  that type.
- No new tables, buckets or enum values. The existing `GRANT ALL` grants cover
  the new columns.
- No RLS added. This matches every other table (see `rls.md`).
- Regenerate types after `mise run db_push` with `mise run update_types`
  (equivalent to `mise exec -- pnpm supabase gen types ...`). Commit
  `src/utils/supabase/database.types.ts`.

## Access and security
- `resolveQuestion(babyId, questionId, correctAnswer)`: `assertIsAdmin`
  (this calls `getUser()`). The update is scoped with
  `.eq('baby_id', babyId).eq('id', questionId).eq('status', 'approved')`.
- `unresolveQuestion(babyId, questionId)`: admin, same scoping. Clears both
  columns so an admin can fix a mistake or re-open the question.
- `setGuessVerdict(babyId, guessId, isCorrect: boolean | null)`: admin.
  Update scoped `.eq('baby_id', babyId).eq('id', guessId)`. Server-side check
  that the guess's question is `type = 'text'`, otherwise throw.
- `setGuessFunny(babyId, guessId, isFunny: boolean)`: admin, same scoping.
- `getLeaderboard(babyId)`: `getUser()` + `getUserAccess(babyId)` membership
  check. Returns **only data from resolved questions**: the answers, the
  correct answer and funny flags of unresolved questions never leave the
  server for members.
- Leaderboard page: `assertPageAccess(babyId, 'guess')` exactly like
  `guess/page.tsx`. That also covers the page-settings role gate.
- `submitGuess` hardening: before inserting, load the question with
  `.eq('id', question_id).eq('baby_id', baby_id)` and reject if it's missing,
  not `approved`, or already resolved (new `serverErrors.pronosticClosed`).
  Today it doesn't check the question at all.
- Tighten `getAllGuesses` from member check to `assertIsAdmin`. Its only
  caller is the admin page. As an exported server action, any member can
  currently call it and read everyone's unresolved guesses. This leak matters
  more now that answers are worth points.
- Delete the unused `getGuesses()` (not baby-scoped, no callers).
- No service-role use. No new public endpoints. No auth, email or push changes.

## Steps
Each step should typecheck and leave the app working. Commit each one, plus the
CHANGELOG follow-up commit.

1. **Migration + types**: add `supabase/migrations/<ts>_guess_results.sql`,
   apply with `mise run db_push`, regenerate with `mise run update_types`.
   Files: `supabase/migrations/<ts>_guess_results.sql`,
   `src/utils/supabase/database.types.ts`.
   Commit: `feat(guess): add results and funny columns to guesses`.

2. **Scoring module (pure, no I/O)**: `src/utils/guess_scoring.ts` exporting:
   - `normalizeText(s)`: trim, lowercase, `normalize('NFD')`, then strip
     combining marks.
   - `toComparable(type, value)`: number via `Number()`; date via
     `new Date(v).getTime()`; time `"HH:mm"` to minutes. Returns `null` if
     unparseable (that guess scores 0).
   - `scoreQuestion(question, guesses): Map<guessId, { points, isCorrect,
     rank? }>` implementing the rules in Assumption 2. Constants
     `POINTS_EXACT = 3` and `PODIUM_POINTS = [3, 2, 1]` live at the top of the
     file.
   - `buildStandings(questions, guesses, members)`: totals per user, number of
     correct/podium answers, `funnyCount`, competition ranking (1, 1, 3).
   Commit: `feat(guess): add pronostic scoring helpers`.

3. **Admin validation actions**: add `resolveQuestion`, `unresolveQuestion`,
   `setGuessVerdict`, `setGuessFunny` to `src/utils/actions/guesses.ts`
   (verdict/funny) and `src/utils/actions/guesses_questions.ts`
   (resolve/unresolve). Follow `deleteGuess` / `reviewQuestion`:
   `assertIsAdmin`, then `logger.child({ function: X.name, babyId, ... })`,
   `.eq('baby_id', babyId)` scoping, `contextLogger.error` + throw on error,
   then `revalidatePath` on `/baby/${babyId}/guess`,
   `/baby/${babyId}/guess/admin` and `/baby/${babyId}/guess/leaderboard`.
   `resolveQuestion` validates `correctAnswer` against the type: a choice from
   `options.choices` for `option`, a finite number for `number`, a parseable
   date for `date`, a non-empty string for `text`. Add
   `serverErrors.invalidCorrectAnswer` and `serverErrors.pronosticClosed`.
   Commit: `feat(guess): add admin actions to resolve pronostics and flag guesses`.

4. **Harden guess reads/writes**: `submitGuess` rejects closed or foreign
   questions. `getAllGuesses` becomes admin-only. Remove `getGuesses`.
   `getQuestionsWithoutGuess` filters `.is('resolved_at', null)` so closed
   questions drop out of "To guess".
   Files: `src/utils/actions/guesses.ts`,
   `src/utils/actions/guesses_questions.ts`.
   Commit: `fix(guess): block guesses on closed pronostics and restrict all-guesses read to admins`.

5. **Leaderboard data action**: `getLeaderboard(babyId)` in
   `src/utils/actions/guesses.ts`. Membership check, then fetch resolved
   approved questions, their guesses and `getUsers(babyId)` in parallel.
   Return `buildStandings(...)` plus `funnyAnswers` (flagged guesses on
   resolved questions: question title, formatted-ready answer + type/options,
   author id) and `resolvedCount` / `totalCount` for a progress hint. Display
   name: `nickname`, then `first_name last_name`, then `guess.unknownUser`.
   Commit: `feat(guess): add leaderboard data action`.

6. **Shared answer formatter**: move `formatAnswer` from `admin/page.tsx` (it's
   duplicated as `formatDisplayValue` in `question_wrapper.tsx`) into
   `src/utils/guess_format.ts`, handling `time` too, so the admin page,
   member cards and leaderboard all format the same way. Pure refactor.
   Commit: `refactor(guess): share pronostic answer formatting`.

7. **Admin UI: resolve + verdict + funny** (after design): on each question card
   in `src/app/baby/[babyId]/guess/admin/page.tsx`:
   - A client component `admin/_components/resolve_question_form.tsx` that
     reuses the existing pickers from `_components/picker/*` to enter the
     correct answer and call `resolveQuestion`. Once resolved, it shows the
     answer and offers to re-open (`unresolveQuestion`, behind
     `confirm-dialog.tsx`).
   - Per guess row: points/rank badge once resolved (from `scoreQuestion`,
     computed server-side in the page); for `text` questions a
     correct/incorrect/auto toggle (`guess_verdict_toggle.tsx`); for all types
     a funny toggle (`funny_toggle.tsx`). Client components call the actions,
     then `router.refresh()`, with errors in a `toast` like
     `delete_guess_button.tsx`.
   - Any dialog or popover uses the existing `Dialog`/`Popover`/`Select`
     primitives, which already sit on the `z-[60]` / `z-[70]` tiers from
     `docs/z-index.md`. No new z-index values.
   Commit: `feat(guess): let admins resolve pronostics and flag funny answers`.

8. **Leaderboard page** (after design):
   `src/app/baby/[babyId]/guess/leaderboard/page.tsx` (Server Component,
   `assertPageAccess(babyId, 'guess')`, calls `getLeaderboard`) plus
   `leaderboard/loading.tsx` copied from `guess/loading.tsx`. It contains:
   ranking list (rank, name, points, funny badge, current user highlighted),
   a "Funniest answers" section and an empty state when `resolvedCount === 0`.
   Add a link to it in the header bar of `guess/page.tsx`, visible to all
   members, next to "Manage". No client component needed unless the designer
   asks for interactivity.
   Commit: `feat(guess): add pronostics leaderboard page`.

9. **Member card shows result** (after design): in `question_wrapper.tsx`, when
   the question is resolved, show the correct answer and the points the user
   earned. `getQuestionsWithGuess` already returns the question row, which now
   includes `correct_answer` and `resolved_at`. Points come from
   `scoreQuestion`, so the wrapper needs all guesses for that question:
   compute server-side in `questions_list_wrapper.tsx` with a small
   member-safe helper that only reads guesses of resolved questions, and pass
   `myPoints` down as a prop.
   Commit: `feat(guess): show pronostic result on the member's own card`.

10. **Translations**: added alongside the steps above, not as a separate commit.

## Translations
New keys in both `messages/en.json` and `messages/fr.json`:
- `serverErrors.pronosticClosed`, `serverErrors.invalidCorrectAnswer`,
  `serverErrors.verdictTextOnly`
- `guess.leaderboardLink`
- `guess.leaderboard.*`: `title`, `subtitle`, `back`, `empty`, `emptyHint`,
  `points` (ICU plural, `{count, plural, ...}`), `rank`, `you`,
  `resolvedProgress` (`{resolved} of {total} pronostics resolved`),
  `funnyTitle`, `funnyEmpty`, `funnyBadge` (plural), `by` (`by {name}`)
- `guess.admin.resolve.*`: `setAnswer`, `correctAnswer`, `save`, `saving`,
  `resolvedOn`, `reopen`, `reopenConfirmTitle`, `reopenConfirmDescription`,
  `error`
- `guess.admin.verdict.*`: `correct`, `incorrect`, `auto`, `error`
- `guess.admin.funny.*`: `flag`, `unflag`, `error`
- `guess.question.*`: `correctAnswer`, `youEarned` (plural), `closed`
- `guess.answerTypes.time` (missing today, needed by the shared formatter
  label if shown)

Final wording is up to the designer; the builder should keep keys in sync
across both files. The full, final key list (including a few additions) is in
the Design section's Copy table below, which supersedes this list.

## Design

Designed for the owner's answers to the open questions: reveal per question
as soon as the answer is set; 3/0 exact and 3/2/1 closest-wins scoring; funny
is a badge only (no points), and funny answers are shown to everyone on the
leaderboard once their question is resolved; ties share points and rank
(1, 1, 3) with no tie-break; members with no guesses on resolved questions are
not listed; re-opening should be rare, so the UI makes it low-key and puts it
behind a confirm dialog, and if it does happen, members who hadn't answered
can guess again.

Visual language reused throughout (same as `guess/page.tsx`,
`guess/admin/page.tsx`, `guesses_tabs.tsx`):
- Page shell: `text-landing-foreground`, `mx-auto w-full max-w-4xl px-4 py-10
  sm:px-6 sm:py-16`.
- Surfaces: `Card` (`src/components/ui/card.tsx`) with `border-landing-border
  bg-landing-surface`; inner rows `rounded-xl bg-landing-background px-3 py-2`.
- Headings: `font-display` (Fraunces) for page title (`text-3xl
  font-semibold`), card titles (`text-base font-semibold`) and section titles.
  Everything else DM Sans (default `font-sans`).
- Muted text `text-landing-muted`; eyebrow labels `text-xs font-semibold
  uppercase tracking-wider text-landing-camel` (as in `my_proposals.tsx`).
- Pills: `rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider`
  (as in `my_proposals.tsx`). Buttons `rounded-2xl cursor-pointer`.
- "Success / you scored" color = the existing emerald family already used for
  answered cards (`bg-emerald-500/10 text-emerald-700 dark:text-emerald-300`,
  `border-emerald-500/20`). "Funny" color = the `rose` token
  (`bg-rose/15 text-rose`), so it can't be confused with the amber "pending"
  pill. Rank/podium accent = `primary` (`bg-primary/15 text-primary`).
- Dark mode exists (`.dark` in `src/app/globals.css`): every color above is a
  token or already has a `dark:` pair in the codebase. No raw hex.
- Icons (lucide): `Trophy` (leaderboard), `Laugh` (funny), `Lock` (closed),
  `Target` (correct answer), `Check` / `X` / `Wand2` (verdict), `RotateCcw`
  (re-open), `Pencil` (change answer), `Quote` (funny card).

### User flow

Admin, resolving a question:
1. Admin opens Pronostics → taps "Manage" → admin page, every question card now
   has a "Set the correct answer" button under the title.
2. Taps it → a `Dialog` opens with the question title, the same picker members
   used (calendar, number field + slider, text field, time, or choice
   buttons), and a short notice that saving closes the pronostic.
3. Picks the value → taps "Save and close" → button shows a spinner + "Saving…",
   dialog closes, toast "Pronostic resolved", card refreshes into its resolved
   state: a "Correct answer" band at the top, each guess row shows its points
   (and podium place for number/date/time), rows re-sorted best first.
4. For a text question, each row shows a small "Auto / Correct / Wrong"
   segmented control; changing it updates the row's points immediately
   (optimistic) and refreshes.
5. On any row, the admin can tap the "Funny" toggle (laughing-face button) to
   flag it; it turns rose and the row gets a small "Funny" pill.
6. Made a typo? "Change" reopens the same dialog prefilled, and the question
   stays closed. This is the path the UI pushes for fixing mistakes. Re-opening
   is a small muted text button at the bottom of the band → a confirm dialog
   that says it's rarely needed and spells out the consequences → if
   confirmed, the band disappears, points vanish and guessing reopens for
   members who hadn't answered.

Member, seeing results:
1. Opens Pronostics → sees a "Leaderboard" button at the top of the page.
2. In "My pronostics", resolved cards show "Your answer" next to "Correct
   answer", the points earned, and a "Closed" pill; a "See the leaderboard"
   link sits at the bottom of each resolved card. Resolved questions they
   never answered silently drop out of "To guess".
3. Taps "Leaderboard" → ranking list with their own row highlighted and
   labelled "You", then "Funniest answers" cards below. Before anything is
   resolved they see a friendly empty state with a way back.

### Screens

#### 1. Entry point on `guess/page.tsx` (header bar)
Wireframe (mobile, 375px):
```
+-------------------------------------------+
| [Trophy Leaderboard]                      |
|            [+ Suggest a pronostic] [Gear Manage] |   <- wraps to 2nd line if needed
+-------------------------------------------+
| (MyProposals, then tabs as today)         |
```
- Layout: change the existing bar `relative flex justify-end gap-2` to
  `relative flex flex-wrap items-center justify-between gap-2`. Leaderboard
  link goes **first** (left), and the existing Modal + Manage buttons go in a
  right-side `flex flex-wrap justify-end gap-2` group. With French copy
  ("Classement", "Proposer un pronostic", "Administrer") the right group wraps
  under the Leaderboard button at 375px instead of overflowing. At `sm+` it all
  sits on one line.
- Components: `Link` + `Button variant="outline" className="gap-2 rounded-2xl
  cursor-pointer"`, identical to the Manage button, icon `Trophy` `h-4 w-4`.
  Visible to every member (rendered outside the `access_level === "admin"`
  check but inside the `!Array.isArray(access)` guard, like the Modal).
  Avoid nesting `<button>` inside `<a>`: use the Button's `render` prop
  (`<Button render={<Link href=… />} …>`) as Base UI allows, or style the Link
  with `buttonVariants`. If the builder keeps the existing `<Link><Button>`
  pattern for consistency, that's acceptable, but fixing both at once is
  better.
- Also add the same link on the admin page header, as a second muted text link
  to the right of "Back to pronostics": `Trophy` + "Leaderboard", same classes
  as the back link (`inline-flex items-center gap-1.5 text-sm
  text-landing-muted hover:text-landing-foreground`). Put the two links in a
  `flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4` row.
- Always visible, even before anything is resolved (the empty state explains).

#### 2. Admin question card: unresolved state
Wireframe (mobile):
```
+-------------------------------------------+
| [^][v]  Baby's weight (g)        [# NUMBER]|
|         Hint text...                       |
|                                            |
| [Target Set the correct answer]            |  <- full width on mobile
|                                            |
| (User) Mamie                       3 250 [Laugh][Trash] |
| (User) Paul                        3 600 [Laugh][Trash] |
|                                    [Pencil Edit] |
+-------------------------------------------+
```
- Layout: insert a resolve area as the first child of `CardContent`, above the
  guesses list (and above the "No answers yet" line when there are none),
  separated by `mb-3`. Button is `w-full sm:w-auto`.
- Components: new client component
  `admin/_components/resolve_question_form.tsx`, built on `Dialog`,
  `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`,
  `DialogDescription` from `src/components/ui/dialog.tsx` (`z-[60]` tier, no
  new z-index). Trigger: `Button variant="default" size="lg" className="gap-2
  rounded-2xl cursor-pointer w-full sm:w-auto"` with `Target` icon. It's
  filled (primary) because it's the main admin task on this card; Edit stays
  outline.
- The guess rows in this state are unchanged except for the new funny toggle
  (see 4).
- Rows without a resolve: no points badge.

#### 3. Resolve dialog (set / change correct answer)
Wireframe (mobile, Dialog is a centered sheet with page margins):
```
+-------------------------------------------+
| Correct answer                        [X] |
| Baby's weight (g)                          |
|                                            |
|  [ 3 250            ]                      |
|  ----o---------------                      |
|                                            |
| (Lock) Saving closes this pronostic:       |
|  nobody can guess anymore and the results  |
|  appear on the leaderboard.                |
|                                            |
|            [Cancel]  [Save and close]      |
+-------------------------------------------+
```
- Content: `DialogTitle` = `resolve.dialogTitle`; `DialogDescription` = the
  question title. Body = the matching picker from `_components/picker/*`
  (`CalendarPicker`, `NumberPicker`, `TextPicker`, `TimePicker`,
  `OptionPicker`) driven by local `useState`, exactly like
  `question_wrapper.tsx` (date starts `undefined`, others `""`). Give the
  picker an `id` and a visible `Label` "Correct answer" above it (`htmlFor`
  that id; for `OptionPicker` / `CalendarPicker`, use `aria-labelledby` on
  the container instead).
- Notice: `rounded-xl bg-landing-background px-3 py-2 text-xs
  text-landing-muted flex gap-2`, `Lock h-3.5 w-3.5` icon. In "Change" mode
  the notice reads `resolve.changeNotice` instead (scores will be recomputed).
- Footer: `flex justify-end gap-2` like `confirm-dialog.tsx`.
  `Button variant="outline" size="sm"` Cancel (`resolve.cancel`), `Button
  size="sm"` primary "Save and close" (in Change mode: "Save"). Disabled while
  the value is empty or while saving; while saving shows `Loader2
  animate-spin` + "Saving…".
- Change mode: same dialog, prefilled with `correct_answer` (date parsed back
  to `Date`). Calls `resolveQuestion` again. **Planner flag**: this requires
  `resolveQuestion` to accept an already-resolved question and keep the
  original `resolved_at`. This matters more now that the owner wants re-open
  to be rare: "Change" is the safe way to fix a typo, since re-opening lets
  late guessers in.
- Date picker caveat: `CalendarPicker` hard-codes `startMonth` Aug 2026 /
  `endMonth` Dec 2026. Fine for this baby; see Questions.
- Number caveat: the real value may fall outside the question's min/max. The
  input accepts it; the slider just clamps visually. Acceptable.
- On success: close dialog, `toast.success(resolve.success)`,
  `router.refresh()`. On error: keep dialog open with the value, `toast.error`
  with the server message (`invalidCorrectAnswer`) or `resolve.error`.

#### 4. Admin question card: resolved state + guess rows
Wireframe (mobile):
```
+-------------------------------------------+
| [^][v]  First name          [Lock T TEXT] |
|                                            |
| +---------------------------------------+ |
| | CORRECT ANSWER                         | |
| | Léa                                    | |
| | Resolved on 4 October 2026             | |
| | [Pencil Change answer]                 | |
| |                       Re-open (muted)  | |
| +---------------------------------------+ |
|                                            |
| +---------------------------------------+ |
| | (User) Mamie                      Lea  | |
| | [3 pts]      [Auto|Correct|Wrong] [Laugh][Trash] |
| +---------------------------------------+ |
| | (User) Paul           Lou-Anne [FUNNY] | |
| | [0 pt]       [Auto|Correct|Wrong] [Laugh][Trash] |
| +---------------------------------------+ |
|                                  [Edit]   |
+-------------------------------------------+
```
Number/date/time rows (no verdict control):
```
| (User) Mamie                      3 250 g |
| [1st · 3 pts]                 [Laugh][Trash] |
```
- Correct-answer band: `rounded-2xl border border-emerald-500/20
  bg-emerald-500/10 dark:bg-emerald-500/[0.05] p-4` (same recipe as the
  member "Your answer" box). Eyebrow `resolve.correctAnswer` in `text-xs
  uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400`;
  value in `text-lg font-extrabold text-emerald-700 dark:text-emerald-300`
  using the shared formatter (step 6); `resolve.resolvedOn` in `text-xs
  text-landing-muted` with the date formatted via `localeTag`
  (`day: "numeric", month: "long", year: "numeric"`).
- Band actions, built so re-opening doesn't look like a normal action:
  - "Change answer": `Button variant="outline" size="sm"` with `Pencil`, in
    `mt-3`. This is the only visible button in the band (opens dialog 3 in
    change mode).
  - "Re-open": a muted text-style button on its own line, right-aligned,
    `mt-2 flex justify-end`: `Button variant="link" size="xs"
    className="relative touch-target text-landing-muted hover:text-landing-foreground"`
    with `RotateCcw h-3 w-3`. No outline, no fill, so it reads as secondary.
  - Re-open goes through `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`)
    with `destructive` left at its default `true` (red confirm button: it
    wipes the answer and the points), `title={resolve.reopenConfirmTitle}`,
    `description={resolve.reopenConfirmDescription}` (says it's rarely
    needed, suggests "Change answer" for typos, and spells out that points
    disappear and members who hadn't answered can guess again),
    `confirmLabel={resolve.reopenConfirm}` ("Re-open anyway"), and
    **explicit `cancelLabel={resolve.cancel}`** (its default is hard-coded
    French "Annuler"). Initial focus should land on Cancel; if
    `ConfirmDialog` can't do that without changes, leave the default.
- Type badge (top-right corner) gains a `Lock h-3 w-3` before the type icon
  when resolved, plus sr-only `resolve.closed`. Light touch; the band is the
  main signal.
- Guess row becomes two lines on mobile: `flex flex-col gap-2 rounded-xl
  bg-landing-background px-3 py-2 text-sm sm:flex-row sm:items-center
  sm:justify-between`.
  - Line 1: author (existing `User` icon + name) left; answer right
    (`font-semibold`, `text-right break-words`, never `truncate`, long free
    text can wrap). Funny pill after the answer when flagged: `Laugh h-3 w-3` +
    `funny.badge`, `bg-rose/15 text-rose`.
  - Line 2: `flex items-center justify-between gap-2`. Left: points pill.
    Right: verdict control (text questions only, resolved only), funny toggle,
    existing `DeleteGuessButton`.
  - At `sm+` both lines merge into one row: name · answer · points ·
    controls.
- Points pill (server-rendered from `scoreQuestion`): `rounded-full px-2.5
  py-1 text-xs font-bold`. Points > 0 → emerald (`bg-emerald-500/15
  text-emerald-700 dark:text-emerald-300`); 0 → `bg-muted
  text-muted-foreground`. Number/date/time with a podium rank: prefix the
  ordinal (`admin.rankShort` "1st" / "1er") and a `·`. Tied guesses show the
  same ordinal and points. Only render when the question is resolved.
- Row order when resolved: points desc, then rank asc, then existing order.
  Unresolved: existing order.
- Verdict control (`admin/_components/guess_verdict_toggle.tsx`): a 3-segment
  control built from three `Button size="xs"` inside `div role="radiogroup"
  aria-label={verdict.label}` with `inline-flex rounded-2xl border
  border-landing-border p-0.5 gap-0.5`. Each segment is `role="radio"
  aria-checked`, selected = `variant="default"`, others `variant="ghost"`.
  Segments: `Wand2` "Auto", `Check` "Correct", `X` "Wrong"; text labels always
  visible (no icon-only). Selected "Wrong" uses `variant="destructive"`
  instead of default so it reads clearly. Arrow keys move selection (roving
  tabindex), Space/Enter selects. `size="xs"` is `pointer-coarse:h-8`; add
  `touch-target relative` to each segment for a 44px hit area. Optimistic: set
  the local selected value immediately, call `setGuessVerdict`,
  `router.refresh()` (points update on refresh). On error: revert,
  `toast.error(verdict.error)`. While pending, `aria-busy` on the group and
  segments disabled (no spinner, it's quick). Hidden for unresolved questions
  (auto-match needs an answer; an override set earlier would still be kept
  by the server).
- Funny toggle (`admin/_components/funny_toggle.tsx`): `Button
  variant="ghost" size="icon-xs" className="relative touch-target"` with
  `Laugh h-3.5 w-3.5`, `aria-pressed={isFunny}`, sr-only label
  `funny.flag` / `funny.unflag` with the author name. On: `bg-rose/15
  text-rose hover:bg-rose/20`; off: `text-landing-muted`. Available on
  resolved **and** unresolved questions, so admins can flag as answers come
  in; everyone sees the flagged answer on the leaderboard only once its
  question is resolved. Optimistic toggle, revert + `toast.error(funny.error)`
  on failure. No success toast (the pill appearing is the feedback).
- Admin hint for flags on unresolved questions: when a guess is flagged and
  its question isn't resolved yet, the funny pill carries a `title` /
  sr-only suffix `funny.hiddenUntilResolved` ("Shown to the family once
  resolved"). No extra visual.

#### 5. Leaderboard page `/baby/[babyId]/guess/leaderboard`
Wireframe (mobile, 375px):
```
+-------------------------------------------+
| <- Back to pronostics                     |
|                                           |
| Leaderboard                (Fraunces 3xl) |
| Who knew baby best? Points come from the  |
| pronostics already resolved.              |
| 3 of 7 pronostics resolved                |
| [=========-------------]                  |
|-------------------------------------------|
| +---------------------------------------+ |
| | (1)  Mamie Jo         [Laugh 2]  9 pts| |
| | (1)  Paul  [YOU]                 9 pts| |  <- highlighted row
| | (3)  Tata Sophie                 5 pts| |
| | (4)  Grand-père Michel-André          | |
| |      Dupont-Lefebvre             2 pts| |  <- long name wraps
| +---------------------------------------+ |
|                                           |
| Funniest answers           (Fraunces xl)  |
| +---------------------------------------+ |
| | FIRST NAME                             | |
| | " Gertrude "                           | |
| | by Paul                                | |
| +---------------------------------------+ |
| +---------------------------------------+ |
| | WEIGHT (G)                             | |
| | " 12 000 "                             | |
| | by Tata Sophie                         | |
| +---------------------------------------+ |
+-------------------------------------------+
```
- Layout: same shell as `admin/page.tsx` (`Reveal` header with `border-b
  border-landing-border pb-6 mb-8`, back link, `h1 font-display text-3xl
  font-semibold`, subtitle `mt-2 max-w-xl text-sm text-landing-muted
  sm:text-base`). Below the subtitle: progress text `mt-3 text-xs
  font-semibold text-landing-muted` + a 6px bar `mt-2 h-1.5 w-full max-w-xs
  rounded-full bg-muted` with inner `h-full rounded-full bg-primary` at
  `width: resolved/total %` (an inline style is fine for the width;
  `aria-hidden`, the text carries the meaning). Hide bar + text when
  `totalCount === 0`.
- Content: `space-y-10`. Ranking `Card`, then the "Funniest answers" section.
  At `md+`: keep a single column for the ranking (`max-w-2xl` inside the 4xl
  shell, left-aligned) and use `columns-1 sm:columns-2 gap-4` for funny
  cards, matching the `guesses_tabs.tsx` masonry.
- Who is listed: only members with at least one guess on a resolved question
  (owner decision). No "0 pts" rows for people who didn't play.
- Ranking list: `Card className="border-landing-border bg-landing-surface
  p-2"` containing an `<ol>` with `divide-y divide-landing-border`. Each
  `<li>`: `flex items-center gap-3 rounded-xl px-3 py-3 min-h-14`.
  - Rank disc: `flex size-9 shrink-0 items-center justify-center rounded-full
    font-display text-base font-semibold`. Ranks 1-3: `bg-primary/15
    text-primary`; others `bg-landing-background text-landing-muted`. Tied
    rows show the same number (1, 1, 3) and keep the order returned by
    `buildStandings`, with no visual tie-break. No medals or emoji; the
    tinted disc is the celebration. Visually-hidden rank text, see
    Accessibility.
  - Name block `min-w-0 flex-1`: name `text-sm font-semibold
    text-landing-foreground break-words` (wraps, never truncated), then
    inline badges with `ml-1.5 align-middle`: "You" pill (`Badge` from
    `src/components/ui/badge.tsx`, `variant="default"`, text
    `leaderboard.you`) on the current user's row; funny badge when
    `funnyCount > 0`: `Badge` with `className="bg-rose/15 text-rose"`,
    `Laugh` icon + count, `aria-label` = `leaderboard.funnyBadge` plural. The
    badge never changes the points.
  - Points `shrink-0 text-right`: number in `font-display text-lg
    font-semibold`, unit `text-xs text-landing-muted` (`leaderboard.points`
    plural renders "9 pts").
  - Current user row: `bg-primary/10 ring-1 ring-inset ring-primary/25`
    in addition to the "You" pill (color is never the only signal).
- Funniest answers, visible to every member: `h2 font-display text-xl
  font-semibold mb-1` + `p text-sm text-landing-muted mb-4`
  (`leaderboard.funnySubtitle`). Each item is a `Card` (`border-landing-border
  bg-landing-surface p-4 mb-4 break-inside-avoid`) with: eyebrow = question
  title (`text-xs font-semibold uppercase tracking-wider text-landing-camel`,
  wraps), the answer as a `blockquote` in `font-display text-lg italic
  text-landing-foreground` with a small `Quote h-4 w-4 text-rose` before it
  (`aria-hidden`), and an author line `leaderboard.by` in `text-xs
  text-landing-muted mt-2`. Answers use the shared formatter. Order: question
  position, then created_at. Only resolved questions' flags appear (enforced
  by `getLeaderboard`). If none are flagged: one muted line
  `leaderboard.funnyEmpty` (`text-sm text-landing-muted italic`) under the
  heading, no dashed box.
- Server Component only; no client component needed. Entry animation: wrap
  the header in the existing `Reveal` (`src/components/reveal.tsx`, which
  already honors `prefers-reduced-motion`); don't animate the rows.

#### 6. Member guess card, resolved state (`question_wrapper.tsx`)
Wireframe (mobile, in "My pronostics"):
```
+-------------------------------------------+
| Baby's weight (g)             [Lock CLOSED]|
| Hint text...                               |
|                                            |
| +------------------+ +-------------------+ |
| | YOUR ANSWER      | | CORRECT ANSWER    | |
| | 3 250            | | 3 410             | |
| +------------------+ +-------------------+ |
|                                            |
| [Trophy You earned 2 points]               |
|                                            |
| See the leaderboard ->                     |
+-------------------------------------------+
```
- Card container when resolved: `border-landing-border bg-landing-surface`
  (warm neutral, not the emerald "answered" tint), so resolved vs
  waiting-for-results is visible at a glance in the same tab.
- Closed pill: put the title and pill in a `flex items-start justify-between
  gap-3` row inside `CardHeader`. `Lock h-3 w-3` + `question.closed`, pill
  recipe with `bg-muted text-muted-foreground`, `shrink-0`.
- Comparison: `grid gap-2`, `grid-cols-2` for option/number/date/time and
  `grid-cols-1 min-[400px]:grid-cols-2` for text (long free text). Each box
  `rounded-2xl p-3 space-y-0.5`:
  - "Your answer": `bg-landing-background border border-landing-border`,
    label `text-xs uppercase font-bold tracking-wider text-landing-muted`,
    value `text-base font-extrabold text-landing-foreground break-words`.
  - "Correct answer": the emerald recipe (`bg-emerald-500/10 border
    border-emerald-500/20`, label `text-emerald-600 dark:text-emerald-400`,
    value `text-emerald-700 dark:text-emerald-300`), `Target` icon before
    the label.
- Points line: pill `inline-flex items-center gap-1.5 rounded-full px-3 py-1
  text-sm font-semibold mt-3`. Points > 0: emerald (`bg-emerald-500/15
  text-emerald-700 dark:text-emerald-300`) with `Trophy h-4 w-4`; 0:
  `bg-muted text-muted-foreground`, no icon, gentle copy ("No points this
  time"). If the builder passes the podium rank too (cheap: `scoreQuestion`
  already returns it), append `question.podium` ("2nd closest") after the
  points; optional, see Questions.
- Footer link: `CardFooter pt-0 pb-4`, a `Link` to
  `/baby/${babyId}/guess/leaderboard` styled `inline-flex items-center gap-1
  text-sm font-medium text-primary hover:underline underline-offset-4 min-h-11`
  with `ArrowRight h-4 w-4`. The card is a client component;
  `questionWithGuess.baby_id` gives the id.
- The existing submit footer stays hidden (it's already hidden when
  answered). Unresolved answered cards are unchanged (emerald, check icon).
- Stale tab: if a member submits on a question that was just closed,
  `submitGuess` throws `pronosticClosed`. Show `toast.error` with that message
  (not the generic `submitError`), then `router.refresh()` so the card drops
  out of "To guess".

### States
- Loading:
  - Leaderboard: `leaderboard/loading.tsx` based on `guess/loading.tsx`
    (`role="status" aria-live="polite"`, sr-only `common.loading`,
    `animate-pulse` like the existing file). Shape: a header block (`h-3
    w-32` back link, `h-8 w-48` title, `h-3 w-3/4` subtitle), then one
    `rounded-3xl bg-muted/70 p-2` card containing five `h-14 rounded-xl
    bg-muted` rows with `space-y-2`, so nothing jumps.
  - Admin resolve dialog: Save button spinner + "Saving…", inputs disabled.
  - Verdict / funny: optimistic, no spinner; controls disabled while the
    request is in flight.
  - Member page: unchanged (existing Suspense spinner).
- Empty:
  - Leaderboard, `resolvedCount === 0`: replace the ranking + funny sections
    with the dashed empty card used in `guesses_tabs.tsx` (`Card border-2
    border-dashed border-landing-border bg-landing-surface py-12`, icon tile
    `p-3.5 bg-landing-background rounded-2xl` with `Trophy h-8 w-8
    text-landing-camel`, heading `font-display text-base font-semibold`
    `leaderboard.empty`, `p text-sm text-landing-muted max-w-sm`
    `leaderboard.emptyHint`), then a primary `Button rounded-2xl` link "Make
    my pronostics" back to `/guess`. The progress text still shows "0 of 7
    pronostics resolved" in the header (hidden if total is 0).
  - Leaderboard, questions resolved but nobody guessed them (standings
    empty): same card, title `leaderboard.noPlayers`, same CTA.
  - Admin, resolving a question with no guesses: allowed; the band shows,
    then the existing "No answers yet." line.
  - Funny section with no flags: muted line (see screen 5).
- Error:
  - Leaderboard fetch failure: falls to the existing `src/app/error.tsx`
    boundary (no route-level one exists). No extra design.
  - Admin actions: `toast.error` (sonner) with the specific server message
    when there is one (`invalidCorrectAnswer`, `verdictTextOnly`), else the
    `*.error` key. Optimistic controls revert. The resolve dialog stays open.
  - Member submit on a closed question: `pronosticClosed` toast + refresh.
- Success:
  - Resolve / change: `toast.success(resolve.success)` + refreshed card.
  - Re-open: `toast.success(resolve.reopened)`.
  - Verdict, funny: no toast; the control state and points pill are the
    feedback.
- Offline / slow:
  - The app has no offline handling today; don't add any. Server actions
    that fail offline surface as the error toasts above; optimistic toggles
    revert, so the admin never sees a state that wasn't saved.
  - Slow network: the dialog keeps the spinner and stays open until the
    action resolves; double submit is prevented by disabling the button.
  - Leaderboard is server-rendered; `loading.tsx` covers slow loads.

### Copy
Member/admin copy uses "vous" in French like the rest of the guess pages.
"Pronostic" is kept in English, as today.

| Key | English | French |
|-----|---------|--------|
| guess.leaderboardLink | Leaderboard | Classement |
| guess.leaderboard.title | Leaderboard | Classement |
| guess.leaderboard.subtitle | Who knew baby best? Points come from the pronostics already resolved. | Qui connaissait le mieux bébé ? Les points viennent des pronostics déjà dévoilés. |
| guess.leaderboard.back | Back to pronostics | Retour aux pronostics |
| guess.leaderboard.resolvedProgress | {resolved} of {total} pronostics resolved | {resolved} pronostic(s) dévoilé(s) sur {total} |
| guess.leaderboard.empty | No results yet | Pas encore de résultats |
| guess.leaderboard.emptyHint | The leaderboard fills up as soon as the first answers are revealed. In the meantime, make your guesses! | Le classement se remplira dès que les premières réponses seront dévoilées. En attendant, faites vos pronostics ! |
| guess.leaderboard.emptyCta | Make my pronostics | Faire mes pronostics |
| guess.leaderboard.noPlayers | Nobody had guessed the revealed pronostics. | Personne n'avait répondu aux pronostics dévoilés. |
| guess.leaderboard.points | {count, plural, one {# pt} other {# pts}} | {count, plural, one {# pt} other {# pts}} |
| guess.leaderboard.pointsLong | {count, plural, one {# point} other {# points}} | {count, plural, one {# point} other {# points}} |
| guess.leaderboard.rank | Rank {rank} | Rang {rank} |
| guess.leaderboard.rankTied | Tied for rank {rank} | Ex æquo au rang {rank} |
| guess.leaderboard.you | You | Vous |
| guess.leaderboard.funnyTitle | Funniest answers | Les réponses les plus drôles |
| guess.leaderboard.funnySubtitle | Picked by the admins for a good laugh. | Choisies par les admins pour le plaisir. |
| guess.leaderboard.funnyEmpty | No funny answers picked yet. | Aucune réponse drôle choisie pour l'instant. |
| guess.leaderboard.funnyBadge | {count, plural, one {# funny answer} other {# funny answers}} | {count, plural, one {# réponse drôle} other {# réponses drôles}} |
| guess.leaderboard.by | by {name} | par {name} |
| guess.admin.leaderboardLink | Leaderboard | Classement |
| guess.admin.rankShort | {rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} | {rank, selectordinal, one {#er} other {#e}} |
| guess.admin.points | {count, plural, one {# pt} other {# pts}} | {count, plural, one {# pt} other {# pts}} |
| guess.admin.resolve.setAnswer | Set the correct answer | Saisir la bonne réponse |
| guess.admin.resolve.dialogTitle | Correct answer | Bonne réponse |
| guess.admin.resolve.correctAnswer | Correct answer | Bonne réponse |
| guess.admin.resolve.closeNotice | Saving closes this pronostic: nobody can guess anymore and the results appear on the leaderboard. | Enregistrer clôture ce pronostic : plus personne ne pourra répondre et les résultats apparaîtront dans le classement. |
| guess.admin.resolve.changeNotice | The pronostic stays closed. Points will be recalculated with the new answer. | Le pronostic reste clôturé. Les points seront recalculés avec la nouvelle réponse. |
| guess.admin.resolve.save | Save and close | Enregistrer et clôturer |
| guess.admin.resolve.saveChange | Save | Enregistrer |
| guess.admin.resolve.saving | Saving… | Enregistrement… |
| guess.admin.resolve.cancel | Cancel | Annuler |
| guess.admin.resolve.change | Change answer | Modifier la réponse |
| guess.admin.resolve.resolvedOn | Resolved on {date} | Dévoilé le {date} |
| guess.admin.resolve.closed | Closed | Clôturé |
| guess.admin.resolve.reopen | Re-open | Rouvrir |
| guess.admin.resolve.reopenConfirmTitle | Re-open this pronostic? | Rouvrir ce pronostic ? |
| guess.admin.resolve.reopenConfirmDescription | This is rarely needed. To fix a typo, use "Change answer" instead. Re-opening removes the correct answer, its points disappear from the leaderboard, and family members who haven't answered can guess again. | C'est rarement nécessaire. Pour corriger une faute, utilisez plutôt « Modifier la réponse ». Rouvrir efface la bonne réponse, ses points disparaissent du classement et les membres qui n'ont pas répondu pourront de nouveau deviner. |
| guess.admin.resolve.reopenConfirm | Re-open anyway | Rouvrir quand même |
| guess.admin.resolve.success | Pronostic resolved | Pronostic dévoilé |
| guess.admin.resolve.reopened | Pronostic re-opened | Pronostic rouvert |
| guess.admin.resolve.error | Something went wrong while saving the answer. | Un problème est survenu lors de l'enregistrement de la réponse. |
| guess.admin.verdict.label | Is {userName}'s answer correct? | La réponse de {userName} est-elle juste ? |
| guess.admin.verdict.auto | Auto | Auto |
| guess.admin.verdict.correct | Correct | Juste |
| guess.admin.verdict.incorrect | Wrong | Faux |
| guess.admin.verdict.error | Couldn't update the verdict. | Impossible de modifier le verdict. |
| guess.admin.funny.badge | Funny | Drôle |
| guess.admin.funny.flag | Mark {userName}'s answer as funny | Marquer la réponse de {userName} comme drôle |
| guess.admin.funny.unflag | Remove funny mark from {userName}'s answer | Retirer la mention drôle de la réponse de {userName} |
| guess.admin.funny.hiddenUntilResolved | Shown to the family once resolved | Visible par la famille une fois dévoilé |
| guess.admin.funny.error | Couldn't update the funny mark. | Impossible de modifier la mention drôle. |
| guess.question.correctAnswer | Correct answer | Bonne réponse |
| guess.question.youEarned | {count, plural, =0 {No points this time} one {You earned # point} other {You earned # points}} | {count, plural, =0 {Pas de point cette fois} one {Vous gagnez # point} other {Vous gagnez # points}} |
| guess.question.podium | {rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} closest | {rank, selectordinal, one {#er} other {#e}} plus proche |
| guess.question.closed | Closed | Clôturé |
| guess.question.seeLeaderboard | See the leaderboard | Voir le classement |
| guess.answerTypes.time | Time | Heure |
| serverErrors.pronosticClosed | This pronostic is closed: the answer has been revealed. | Ce pronostic est clôturé : la réponse a été dévoilée. |
| serverErrors.invalidCorrectAnswer | This answer isn't valid for this pronostic. | Cette réponse n'est pas valide pour ce pronostic. |
| serverErrors.verdictTextOnly | Only free-text answers can be marked correct or wrong by hand. | Seules les réponses libres peuvent être jugées justes ou fausses à la main. |

Note: `guess.leaderboard.resolvedProgress` in French uses "(s)" to avoid a
double plural. If the builder prefers, an ICU plural on `resolved` is fine
too.

### Accessibility
- The leaderboard list is a real `<ol>`; each `<li>` gets an sr-only prefix:
  `leaderboard.rank` or, when tied, `leaderboard.rankTied`. The visual rank
  disc is `aria-hidden`. Points read as the long form
  (`leaderboard.pointsLong`) via sr-only, with the short form visible.
- "You" is text, not only the highlight color. The funny badge has an
  `aria-label` with the plural count; its icon is `aria-hidden`.
- The page has one `h1` (title) and an `h2` for "Funniest answers"; the empty
  state heading is an `h2` on this page since it's then the only section.
- Funny cards: `<figure>` with `<blockquote>` + `<figcaption>` ("by …").
- Verdict control: `role="radiogroup"` with an `aria-label` naming the
  author; segments `role="radio"`, `aria-checked`, roving tabindex with
  arrow keys; visible text labels. Funny toggle: `aria-pressed` + an sr-only
  label naming the author (like `DeleteGuessButton`'s `srDelete`).
- All small controls get `relative touch-target` (44px on touch, see
  `globals.css`), including the muted Re-open link. Buttons keep the default
  focus ring from `button.tsx`.
- Resolve dialog: the Base UI `Dialog` traps focus and closes on Esc; initial
  focus goes to the picker input (text/number/time) or the first choice /
  calendar day; on close, focus returns to the trigger. The picker has a
  visible label tied by `htmlFor` / `aria-labelledby`.
- Re-open uses `ConfirmDialog` with translated `cancelLabel` /
  `confirmLabel` (its defaults are hard-coded French). The consequences are
  in the dialog description, so screen readers announce them.
- Contrast: emerald 700/300 on the 10% emerald tint and `text-rose` on
  `bg-rose/15` should meet 4.5:1 for the bold 12px pill text in light mode;
  the builder should spot-check `text-rose` in dark mode (`--rose` is
  lightened there and should pass). `text-landing-camel` eyebrows are
  already used at this size elsewhere.
- On the member card, correct vs wrong comes across through labels ("Your
  answer", "Correct answer") and the points sentence, not just color.
- Motion: only the existing `Reveal` on the leaderboard header (it honors
  `prefers-reduced-motion`). No confetti, no row animations. The progress bar
  doesn't animate.
- Long names and French strings wrap (`break-words`); nothing important is
  truncated. Points and rank columns are `shrink-0`.
- Overlays: only `Dialog` / `ConfirmDialog` (`z-[60]`) and, inside them, any
  `Select`/`Popover` from the calendar caption dropdown (`z-[70]`), per
  `docs/z-index.md`. No new z-index values anywhere.

### Questions
- **Change answer without re-opening** (planner flag): the design's main way
  to fix a mistake is "Change answer", which calls `resolveQuestion` on an
  already-resolved question. Confirm `resolveQuestion` allows that (no
  `resolved_at IS NULL` filter) and keeps the original `resolved_at`.
  Without it, fixing a typo means re-opening, which the owner wants to avoid.
- **Podium place on the member card**: showing "2nd closest" next to the
  points needs `rank` passed alongside `myPoints` from
  `questions_list_wrapper.tsx` (step 9). A small data change and a nice
  touch; owner/planner to confirm.
- **Results teaser**: a small "Results are in, see the leaderboard" banner at
  the top of the Pronostics page when `resolvedCount > 0` would help
  relatives who aren't comfortable with tech notice the leaderboard. Not in
  the plan's scope; owner to decide.
- **Date range**: `CalendarPicker` only allows Aug–Dec 2026. If the real birth
  date (or any date question) falls outside that, the admin can't enter it.
  Worth deriving the range from the question options in a follow-up.

## Risks and open questions
Owner answers received (relayed by the coordinator); all match the plan's
defaults, so no change to scope or data.

1. **Reveal timing.** Resolved: per question, as soon as the admin sets the
   answer. No global reveal switch.
2. **Points scheme.** Resolved: approved as planned (3/0 for exact types,
   3/2/1 closest-wins podium for number/date/time).
3. **Funny flags and points.** Resolved: badge only, no points. Funny answers
   are shown to everyone in the leaderboard's "Funniest answers" section once
   their question is resolved.
4. **Tie-break.** Resolved: none. Tied players get the same points and the
   same rank (e.g. 3 and 3, ranks 1, 1, 3).
5. **Who is listed?** Resolved: only members with at least one guess on a
   resolved question. Members with no guesses there are not shown.
6. **Date precision.** (Technical note, not an owner question.) Dates are
   stored as `toISOString()` of a local midnight, so "closest" compares in
   milliseconds. That's fine for ranking, but any future "exact day" logic
   must compare in the family's timezone, not UTC.
7. **Re-opening a resolved question.** Resolved: it shouldn't normally
   happen, so the UI discourages it (muted secondary control, confirm dialog
   that points to "Change answer" instead). If it does happen, the answer is
   cleared and members who hadn't answered can guess again.
8. Tightening `getAllGuesses` to admin-only is a behavior change for any
   caller I missed. Grep found only `guess/admin/page.tsx`. (Technical note,
   still open for the reviewer.)

### Owner decisions on designer follow-ups (2026-10-06)
1. `resolveQuestion` accepts an already-resolved question (updates `correct_answer`, keeps original `resolved_at`) so "Change answer" fixes typos without re-opening.
2. Show the member's podium place ("2nd closest") on their resolved card — pass `rank` alongside `myPoints`.
3. No "Results are in" banner — out of scope.
4. `CalendarPicker` Aug–Dec 2026 range limit: follow-up, not in this feature.

## How to verify
- `pnpm typecheck` and `pnpm lint` pass after every step.
- As **admin**: create a number question ("Weight in g"), a date question, an
  option question and a text question ("First name"). Have 3+ test users
  answer, including a tie on the number question and "léa " vs "Lea" on the
  text one.
- Resolve each question from the admin page and check that:
  - the number/date podium gives 3/2/1, and tied distances get equal points;
  - the option question gives 3 to exact matches only;
  - the text question auto-matches "léa " and "Lea" against "Léa", and a
    manual "incorrect" override drops the points;
  - the leaderboard totals and ranks (1, 1, 3) match.
- Flag one guess as funny. It appears in "Funniest answers" and the author's
  badge count goes up. Flag a guess on an **unresolved** question and confirm
  it does **not** appear for a viewer.
- As a **viewer**: the resolved question is gone from "To guess", and the card
  in "My pronostics" shows the correct answer and points. Calling
  `submitGuess` on a resolved question (e.g. a stale tab) returns the
  `pronosticClosed` error.
- **User without access**: a user who is not a member of the baby (or a viewer
  when the guess page is admin-only in page settings) opening
  `/baby/<id>/guess/leaderboard` is redirected or blocked by
  `assertPageAccess`, the same as `/guess`. A viewer calling `resolveQuestion`,
  `setGuessFunny` or `getAllGuesses` gets `unauthorized`.
- Change a resolved question's answer with "Change answer": the question stays
  closed and points are recomputed.
- Re-open a question (through the confirm dialog): points vanish from the
  leaderboard, and members who hadn't guessed can guess again.
- Delete a guess on a resolved number question: the podium re-ranks on the
  next load (no stale stored scores).
