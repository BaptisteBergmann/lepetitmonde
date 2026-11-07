---
tags: [lepetitmonde/feature]
---

# Guessing game

Up: [[Le petit monde]] · Route: `/baby/[babyId]/guess` ("Pronostics") · Code: `guess/`, `actions/guesses.ts`, `guesses_questions.ts`, `guess_scoring.ts`, `guess_format.ts`

A game for relatives to predict the baby's birth date, name, weight and so on.

- **Question types**: date, number (min/max/precision), free text, time, single choice. One picker per type in `guess/_components/picker/`.
- **One guess per question**, final once submitted.
- **Proposals**: any member can propose a question; it stays `pending` until an admin approves it (and sets its type), or rejects it. Admin questions publish immediately.
- **Admin** (`guess/admin/`): approve, reject, edit, reorder, delete (blocked once a question has guesses).
- **Resolution and scoring**: an admin enters the real answer.
  - Exact questions: 3 points for free text (auto-matched after normalisation, admin can override), 1 point for single choice.
  - Closest-wins questions (date, number, time): 3 / 2 / 1 points by distinct distance, ties share a rank.
  - Admins can flag a guess as "funny" (a badge, no points).
- **Leaderboard** at `/guess/leaderboard`.

Tables: `guess_questions`, `guesses`. Notification: `new_pronostic`.
