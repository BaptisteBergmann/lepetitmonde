# Pronostics: question resolution + leaderboard

## Goal

Let an admin "validate" (resolve) an approved guess question by entering the
correct answer, automatically score every submitted guess against it, and
show a per-baby leaderboard ranking members by points earned across all
resolved questions.

## Confirmed scoring rules

- `text` / `option` questions: **exact match only**. Every guess equal to the
  correct answer wins.
- `number` / `date` / `time` questions: **closest guess wins** if nobody is
  exactly right (classic baby-pool mechanic).
- Points: **exact match = 2 pts**, **closest-but-not-exact = 1 pt**. Ties
  (multiple guesses at the same winning value/distance) all get the full
  points — points are never split.
- Leaderboard score per user = sum of points across every *resolved*
  question in that baby.

## Schema

New migration, `supabase/migrations/<ts>_add_guess_question_resolution.sql`:

```sql
alter table public.guess_questions
  add column correct_answer jsonb,
  add column resolved_at timestamptz;
```

- `correct_answer` follows the same per-`type` jsonb shape as `guesses.answer`
  / `guess_questions.options` — no new shape convention needed.
- A question is **resolved** iff `status = 'approved' AND resolved_at IS NOT
  NULL`. Do **not** touch the existing `status` CHECK — proposal moderation
  (`pending`/`approved`/`rejected`) stays orthogonal to resolution; a question
  can be approved-but-unresolved, then approved-and-resolved.
- After writing the migration: `mise run db_push`, then `mise run
  update_types` to regenerate `src/utils/supabase/database.types.ts`.

## Scoring helper (new, shared logic)

`src/utils/guess_scoring.ts` — pure functions, used by both the resolve
action (to notify winners / show a preview) and the leaderboard action:

- `computeWinners(question: Tables<'guess_questions'>, guesses: Tables<'guesses'>[]): { userId: string; points: 1 | 2 }[]`
  - `'text' | 'option'`: normalize + exact-compare `answer` vs
    `correct_answer` → 2 pts each match.
  - `'number' | 'date' | 'time'`: convert both sides to a comparable number
    (raw number, `Date#getTime()`, minutes-since-midnight for time), compute
    absolute distance. Distance `0` → 2 pts. Otherwise find the minimum
    distance among all guesses and award 1 pt to every guess at that minimum.
  - No guesses / no `correct_answer` → `[]`.

## Server Actions

In `src/utils/actions/guesses_questions.ts` (mirrors the existing
`reviewQuestion` admin pattern — `assertIsAdmin`, `revalidatePath`, notify):

- `resolveQuestion(babyId, questionId, correctAnswer: Json)` — admin-only.
  Verifies the question belongs to the baby and is `approved`. Sets
  `correct_answer` + `resolved_at = now()`. Re-callable (admin can correct a
  typo by resolving again) — no "already resolved" guard needed.
- `unresolveQuestion(babyId, questionId)` — admin-only "reopen": clears
  `correct_answer`/`resolved_at` back to `null`, in case an admin resolves by
  mistake.
- `getLeaderboard(babyId)` — any baby member (leaderboard visibility matches
  the existing guesses visibility: baby-wide, not admin-only, per
  `.claude/plans/rls.md`'s intended policy). Loads all resolved questions +
  their guesses + `getUsers(babyId)`, runs `computeWinners` per question,
  sums points per user, returns a sorted `{ userId, name, points,
  questionsWon }[]`.

Both `resolveQuestion` and `reviewQuestion`-adjacent flows should
`revalidatePath` for `/baby/[babyId]/guess`, `/baby/[babyId]/guess/admin`, and
the new `/baby/[babyId]/guess/leaderboard`.

Optional (should-have, not blocking): notify all guessers on a question when
it resolves, mirroring the existing `new_pronostic` notify call — would need
a new `pronostic_resolved` value added to the `notification_type` enum.

## UI

1. **Admin resolve flow** — `admin/page.tsx` +
   new `admin/_components/resolve_question_modal.tsx` (Client Component).
   Each approved question gets a "Valider" button if unresolved, or shows the
   stored correct answer + a "Modifier la réponse" / "Réouvrir" pair if
   already resolved. The modal reuses the existing per-type picker components
   (`_components/picker/*`) to capture `correct_answer` in the same UI shape
   used for a guess. Submits via `resolveQuestion`; "Réouvrir" calls
   `unresolveQuestion`.
2. **Winner display** — once resolved, both the admin page's per-question
   guess list and the member-facing `question_wrapper.tsx` show the correct
   answer and a small badge/highlight on winning guesses.
3. **Leaderboard page** — new `app/baby/[babyId]/guess/leaderboard/page.tsx`
   (Server Component). `assertPageAccess(babyId, 'guess')`, calls
   `getLeaderboard(babyId)`, renders a ranked list (rank, name, points, #
   questions won) using existing `Card`/`Reveal` primitives. Linked from the
   main `guess/page.tsx` header, visible to all members (not just admins).

## i18n

Add keys under the existing `guess` namespace in `messages/fr.json` and
`messages/en.json`: resolve-modal labels ("Valider la question", "Réponse
correcte", "Réouvrir"), leaderboard page title/column labels ("Classement",
"points", "pronostics gagnés"), and — if the optional notification is
included — a `pronostic_resolved` string alongside the existing
`new_pronostic` one (`messages/*.json` line ~210).

## Verification

No test framework exists in this repo, so verify manually: after the
migration + `db_push`/`update_types`, run `pnpm dev`, propose/approve one
question per type, submit guesses as multiple members, resolve each as admin
with values producing both an exact-match case and a closest-wins case,
confirm the leaderboard totals match hand-computed expectations, and confirm
"Réouvrir" clears scoring. Run `pnpm typecheck` and `pnpm lint` before each
commit.

## Commit plan

Small, scoped, Conventional Commits, with a `CHANGELOG.md` follow-up commit
after each (per `CLAUDE.md`):

1. `feat(db): add correct_answer and resolved_at to guess_questions`
2. `feat(pronostics): add resolveQuestion/unresolveQuestion/getLeaderboard actions and scoring helper`
3. `feat(pronostics): add admin resolve-question UI`
4. `feat(pronostics): show correct answer and winners on question cards`
5. `feat(pronostics): add leaderboard page`
6. (optional) `feat(pronostics): notify members when a question is resolved`
