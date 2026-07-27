# Calendar Event Types Rework

## Context

The calendar currently has a two-level event model: `event_kind` (`custom` |
`milestone`) and, only when `kind = 'milestone'`, a `milestone_type` with 7
fixed values (first_steps, first_tooth, first_word, first_smile,
first_laugh, birthday, other). Only `milestone` events trigger a
notification (`new_milestone`, sent immediately on creation to the circle).

The user wants three top-level categories instead, decided through
discussion:

1. **`life_stage`** ("Étape de vie") — merge of the old `milestone` concept
   with the "étape de vie" idea the user floated; keeps all 7 existing
   sub-types and icons unchanged, keeps the existing immediate
   notification-on-create behavior.
2. **`occasion`** ("Occasion") — straight rename of `custom`. Same freeform
   behavior (title/description only, no sub-type, no notification).
3. **`medical`** ("Rendez-vous médical") — brand new. No sub-type, gets an
   optional time-of-day field (`event_time`), a dedicated icon
   (`Stethoscope`) on the calendar grid, and explicitly **no notification**
   (confirmed by user).

The `notification_type` enum value `new_milestone` is renamed to
`new_life_stage` for consistency with the `kind` rename (its French label
"Nouvelles étapes du calendrier" doesn't change).

No RLS policies exist in this project (access control is app-layer only via
`assertIsAdmin`/`getUserAccess`/`getUserCircleIds`), so no policy updates
are needed.

## Data model change

New migration `supabase/migrations/<ts>_rework_event_kinds.sql`:

```sql
ALTER TYPE "public"."event_kind" RENAME VALUE 'custom' TO 'occasion';
ALTER TYPE "public"."event_kind" RENAME VALUE 'milestone' TO 'life_stage';
ALTER TYPE "public"."event_kind" ADD VALUE 'medical';

ALTER TYPE "public"."notification_type" RENAME VALUE 'new_milestone' TO 'new_life_stage';

ALTER TABLE "public"."events" ALTER COLUMN "kind" SET DEFAULT 'occasion';
ALTER TABLE "public"."events" ADD COLUMN "event_time" time without time zone;
```

`event_time` follows the existing bare-`time` convention already used by
`notification_settings.quiet_hours_start/end`, kept independent from
`event_date` (a `date` column) rather than merging into a `timestamptz`.

Note: the `ADD VALUE 'medical'` statement must not be followed by any DML
that uses the literal `'medical'` in the *same* migration file/transaction
(Postgres restriction on using a new enum value before commit) — this plan
doesn't do that, so one migration file is sufficient.

Apply with `mise run db_push`, then regenerate types with
`mise run update_types`.

## Code changes

- **`src/utils/actions/events.ts`**
  - Default kind `'custom'` → `'occasion'`.
  - `kind === 'milestone'` checks (milestone_type assignment on
    create/update) → `kind === 'life_stage'`.
  - Notification branch: `if (kind === 'life_stage')` → send
    `'new_life_stage'` (was `'new_milestone'`).
  - No notification branch added for `medical`.
  - Pass through `event_time` on create/update when present.

- **`src/app/baby/[babyId]/calendar/_components/create_event_modal.tsx`**
  - `KIND_ITEMS` labels: `occasion: "Occasion"`,
    `life_stage: "Étape de vie"`, `medical: "Rendez-vous médical"`.
  - Default `useState` kind → `'occasion'`.
  - Rename `isMilestone` → `isLifeStage` (`kind === 'life_stage'`).
  - Add `isMedical = kind === 'medical'` branch: show a time input, wire to
    `event_time` in the submitted payload.

- **`src/app/baby/[babyId]/calendar/_components/constants.ts`**
  - Add `KIND_ICONS` (or similar) with a `Stethoscope` (lucide-react) icon
    for `medical`. `MILESTONE_ICONS`/`MILESTONE_LABELS` stay as-is (still
    keyed by `milestone_type`, unaffected by the `kind` rename).

- **`src/app/baby/[babyId]/calendar/calendar_view.tsx`**
  - `e.kind === 'milestone'` → `'life_stage'` for the sub-type icon lookup.
  - Add rendering for `kind === 'medical'` using the new `Stethoscope` icon.

- **`src/app/baby/[babyId]/calendar/_components/day_detail_sheet.tsx`**
  - Same `'milestone'` → `'life_stage'` rename.
  - Display `event_time` (e.g. "15:30 — Titre") when set on a medical event.

- **`src/utils/notification-types.ts`**
  - Rename key `new_milestone` → `new_life_stage`, same label.

- **`src/utils/supabase/database.types.ts`** — regenerated, not hand-edited.

No changes needed in `src/app/settings/_components/baby_settings_card.tsx`
or `src/app/_header/notification_bell.tsx` — both render notification
types generically from `notification-types.ts`.

## Verification

No test suite exists in this repo. Verify with typecheck/build, then
manually exercise via the `run` skill: create one event of each kind
(occasion, life_stage with a sub-type, medical with a time), confirm only
life_stage sends a notification, confirm calendar grid + day detail render
correctly for all three.
