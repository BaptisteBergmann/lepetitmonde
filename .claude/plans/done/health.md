# Health (growth, WHO curves, vaccinations)

## Status: implemented
Shipped 2026-10-31 in steps 1-11 (see CHANGELOG). Deviations from the plan:
- Decision 14 added a per-baby `vaccine_schedule` (`fr` | `ca_qc`) on `baby_health_profiles`; schedules are keyed by id (`fr-2026`, `ca-qc-2026`) and the Québec rows come from the Quebec.ca PIQ summary. Doubts are listed in the header of `src/utils/vaccine-schedule.ts`.
- The French schedule was verified against Vaccination Info Service (updated 2026-05-03), not the official PDF, which was unreachable.
- `upsertHealthProfileCore` is a two-step insert-if-missing then update, because PostgREST's upsert needs UPDATE on `baby_id`.
- `PageId` gained `'health'` in step 4 (needed by the cores); the registry entry came in step 6. `tz_cookie.tsx` was moved to `src/components` with `use_online.ts`.
- The chart `<svg>` uses `role="group"` instead of `role="img"` so the point buttons stay reachable. For lengths, `lmsAt` extrapolates between months 23 and 24 so the lying-to-standing step is not blended.
- The page-level view switch and chart are verified by typecheck, lint and `pnpm build` only; no browser test was run.

Status: approved
Approved by: Baptiste (2026-10-31, all recommended defaults)

## Decisions (approved 2026-10-31)
1. Writes are admin-only in both the app and RLS, even when viewers can open the page.
2. Birth date and sex go in a new `baby_health_profiles` table.
3. Sex has two values (girl/boy). No curves are shown until it's set.
4. Use WHO curves, with a disclaimer that they may differ from the carnet de santé (AFPA/Inserm).
5. No corrected age. All ages are chronological.
6. Hand-drawn SVG chart, no new dependency.
7. Include the 6-year booster. Verify the schedule against the official 2026 French calendar.
8. Shots record date, vaccine, dose and note only. No product or lot number.
9. Add a `set_health_profile` MCP tool.
10. Apply the migration after the migration-only review in step 1.
11. "Mark as given" opens a prefilled modal (two taps).
12. The profile label is "Sex at birth".
13. Keep the live percentile hint, the unusual-value warning and the success toasts.
14. (Added 2026-10-31) Support a Québec schedule alongside the French one:
    - Store a per-baby `vaccine_schedule` on `baby_health_profiles` (`'fr' | 'ca_qc'`, NOT NULL DEFAULT `'fr'`) in the same, still unapplied migration. Re-review the migration before it's applied.
    - Ship a static `ca_qc` schedule from the Protocole d'immunisation du Québec (PIQ) 2026, verified against the official MSSS source. Share vaccine codes with the French schedule where it's the same antigen.
    - The vaccine view uses the baby's schedule, the profile card can change it, and `set_health_profile` (MCP) accepts it.
    - The source line and copy name the schedule in use.
    - WHO curves are unchanged.
- Designer flags accepted: `assertPageAccess` returns the user's level so the client can hide write controls (UI only, enforcement stays in the cores and RLS). Move `tracker/_components/use_online.ts` to `src/components/use_online.ts`.

## Goal
Give parents one members-only page per baby for health records:
- growth measurements (weight, length/height, head circumference) plotted against the WHO Child
  Growth Standards percentile curves;
- vaccinations already given, plus the upcoming French schedule with due and overdue shots.

The same data can be logged and read through the MCP server.

## Out of scope
- Corrected age for premature babies. Curves use chronological age (see open questions).
- French AFPA/Inserm 2018 curves, CDC curves, and BMI-for-age / weight-for-length charts. Only
  WHO weight-, length/height- and head-circumference-for-age, 0–5 years.
- Vaccination reminders (push, email, digest). No change to `notify.ts`.
- Risk-based vaccines in the schedule (BCG, hepatitis B at birth, flu, COVID). They can still be
  recorded as given shots.
- Adolescent boosters (dTcaP at 11–13, HPV, MenACWY at 11–14). The schedule stops at 6 years.
- Other countries' schedules, and switching the schedule by birth cohort.
- Lot numbers and product names on shots. Easy to add as columns later (see open questions).
- Realtime refresh. The data is sparse, so `revalidatePath` is enough. No relay binding.
- Exposure through share links, the feed, the calendar, the digest or `get_digest`.
- An MCP tool to edit entries or to set birth date and sex. The tracker MCP has no update tool
  either.
- Moving `weight` into `care_events`. The baby-tracker plan listed weight as a future care
  kind. This plan deliberately supersedes that with a separate table.

## Current state
- **Babies**: `babies` (baseline) has only `id`, `created_at` and `baby_surname`.
  - **No birth date and no sex are stored anywhere.** Grep finds nothing in the migrations,
    `database.types.ts` or `src/`.
  - `babies` has no RLS and still grants ALL to `anon` and `authenticated` (baseline). Its RLS is
    batch B3 of `.claude/plans/rls.md`, which is on hold and owned by someone else.
  - Babies are read in `src/utils/actions/baby.ts` (`getBaby`, `getBabiesList`). No action
    edits a baby.
- **Tracker (pattern to copy)**:
  - Page: `src/app/baby/[babyId]/tracker/page.tsx` (Server Component, `assertPageAccess`,
    `Reveal` header), with `loading.tsx` and `error.tsx`.
  - Cores: `src/utils/care-core.ts`. Server-only and not `'use server'`. Each core takes
    `(supabase, userId, babyId, …)` and calls `assertPageAccessForUser(…, 'tracker')` from
    `src/utils/member-access.ts`. Callers pass either the cookie client or the service-role
    client.
  - Actions: `src/utils/actions/care_events.ts` are thin wrappers (`getAuthUser()` → core).
    Expected failures come back as `{ ok: false, error: key }` because thrown action messages
    are masked in production.
  - Validation: `src/utils/care-validation.ts` (`CareValidationError` with a key, mirrors the SQL
    CHECKs). Client-safe constants: `src/utils/care-events.ts`. Date and zone helpers:
    `src/utils/care-time.ts` (`todayInZone`, `isValidDay`) and `src/utils/care-timezone.ts`
    (`getRequestTimeZone`, which reads the `tz` cookie and falls back to `FAMILY_TIME_ZONE`).
  - Migration: `20261023100000_create_care_events.sql` plus
    `20261023120000_harden_care_events_grants.sql`. Together they enable RLS, revoke ALL from
    `anon` and `authenticated`, grant back SELECT/INSERT/DELETE plus column-level UPDATE, and use
    `is_baby_member` policies. The hardening was needed because the baseline default privileges
    grant ALL on every new table.
- **Pages registry**: `src/utils/page_registry.ts` (`PageId` union, `PAGE_REGISTRY`) drives the
  header, bottom bar, mobile menu, landing cards and admin → page settings
  (`admin/_components/display_page_settings.tsx`).
  - Names come from `pages.<id>.{name,eyebrow,description}` in `messages/{en,fr}.json`.
  - `page_settings.page_id` is text, so a new page id needs no migration.
  - `PRIMARY_PAGE_IDS` lives in `src/app/_header/page_order.ts`.
- **MCP**:
  - `src/app/api/mcp/route.ts` authenticates via `resolveBearer` (`src/utils/mcp-auth.ts`). It
    accepts a personal `lpm_` token or an OAuth `lpma_` token with the single scope `mcp`.
  - `src/app/api/mcp/tools/index.ts` registers the tool families with the service-role client.
  - `tools/tracker.ts` is the model: zod input schemas, `run()` from `tools/shared.ts`, cores do
    the access checks.
  - `run()` translates `ActionError` and `CareValidationError` (`tracker.errors.codes`) into tool
    errors.
  - `tools/babies.ts` has `MCP_AREAS`, which tells the model which tool families apply to which
    baby.
  - The OAuth scope is all-or-nothing, so no per-area scopes are needed.
- **i18n**: `src/i18n/config.ts` has locales `fr` (default) and `en`. `DEFAULT_LOCALE` env picks
  the deployment locale, and there is no per-user locale. The app is French-first, so the French
  national schedule fits regardless of UI language.
- **Charting**: `package.json` has no chart library (no recharts, visx, chart.js or d3).
  `date-fns` v4 is available.
- **UI primitives available**: `components/ui/{calendar,popover,select,dialog,input,field}`,
  `components/modal.tsx`, `components/choice_group.tsx`, `components/confirm_provider.tsx`.

### CLAUDE.md drift (trust the code)
- Server Actions live in `src/utils/actions/`, not `app/actions/`.
- There is no `@/utils/supabase/client`.
- URLs use `baby/[babyId]`, not `project/[projectId]`.
- The deployment's only build arg is `NEXT_PUBLIC_COMMIT_SHA`.

## Approach
A new `health` page (`/baby/[babyId]/health`) backed by three new tables:
- `baby_health_profiles`: birth date and sex, one row per baby.
- `growth_measurements`: one row per measuring session, with three nullable metrics.
- `vaccinations`: shots given.

The reference data is code, not data:
- WHO LMS tables ship as a generated static TypeScript module.
- The French vaccine schedule is a static, versioned config.
- Percentile curves, z-scores and due/overdue status are computed by pure, client-safe
  functions.

The code follows the tracker's layers:
- pure modules for constants and math;
- `health-validation.ts`;
- `health-core.ts` (server-only, page access checked inside every core);
- thin Server Actions in `src/utils/actions/health.ts`;
- an MCP tool family in `tools/health.ts` that calls the same cores.

The chart is a hand-rolled SVG built by a pure function, so no dependency is added.

### Decisions and alternatives
- **Birth date and sex in a new RLS table, not on `babies`.** `babies` has no RLS and grants
  ALL to `anon`. Health-adjacent personal data put there would be readable by anyone holding
  the anon key, until a rollout owned by someone else lands. A separate table gets RLS and a full
  revoke from day one.
  - Cost: one extra small query. If birth date is later needed elsewhere (calendar birthday,
    age display), it can be read from this table.
- **Separate tables rather than `care_events` kinds.** Measurements and shots are dated (not
  timed), sparse, and have their own fields (three metrics; vaccine code and dose). Forcing them
  into `care_events` would add five nullable columns and CHECKs to a table built around
  `started_at`/`ongoing`, and would mix them into the tracker's day log.
- **One measurement row holds up to three metrics** (at least one non-null). This matches a
  doctor visit and the carnet de santé. A row per metric would triple writes for the common case.
- **Integers in SI sub-units**: `weight_g`, `length_mm`, `head_circumference_mm`. This avoids
  float drift. The UI and MCP use kg and cm.
- **`measured_on` / `given_on` are `date`, not `timestamptz`.** Age is counted in whole days
  from the birth date, so there are no timezone conversions. "Today" for defaults and due
  status uses `getRequestTimeZone()`.
- **WHO data as a static TS module, not a table.**
  - The data is immutable, public reference data: about 2 sexes × 3 indicators × 61 monthly
    rows of (L, M, S), roughly 15 KB.
  - A module needs no RLS, migration or query, works the same in the page and in MCP, and is
    versioned with the code.
  - A table would add grants and policies for no benefit.
- **Vaccine schedule as static config, not a table.** It changes about once a year by national
  decree, it is the same for every family, and it needs code review when it changes. A table
  would invite per-family edits nobody asked for.
- **Matching a shot to a schedule slot uses `(vaccine_code, dose_number)`**, not a stored
  schedule-slot id. That keeps given shots valid if the schedule config is reorganized, for
  example a slot renamed or an age moved.
  - `vaccine_code` is text validated in the app against the config, plus a format CHECK. It is
    not a Postgres enum because the French list changes; 2025 replaced MenC with MenACWY and
    added MenB, and enum edits need their own migrations.
  - `dose_number` is auto-assigned on create when omitted: the count of existing shots with that
    code, plus 1.
- **Chart: hand-rolled SVG, no dependency.** A percentile chart is five to seven polylines
  (shaded bands between them, optionally) plus dots on two linear axes. A pure
  `buildGrowthChart(...)` returns scales, paths and points, and a small component renders them.
  It works in a Server Component, ships no chart JS and needs no Base UI or Tailwind adapter.
  - Alternative: shadcn `chart` (recharts v3, about 100 KB gzipped). It would only be worth it
    if the designer wants rich hover tooltips, zoom or brush. It needs a Client Component and a
    new dependency. See open questions.
- **Writes are admin-only, enforced in both the app and RLS. Reads follow page access.**
  - This is stricter than the tracker (member RLS for everything), because health data is more
    sensitive.
  - If an admin opens the page to viewers in page settings, viewers can read but not write.
  - RLS `SELECT` is `is_baby_member` (the app narrows further through page settings).
    `INSERT`/`UPDATE`/`DELETE` are `is_baby_admin`. See open questions.

## Data and migrations
One additive migration, created with `mise run db_migration_new create_health`
(`supabase/migrations/<ts>_create_health.sql`). It creates new types and tables only and touches
no existing table. Sketch:

```sql
CREATE TYPE "public"."baby_sex" AS ENUM ('female', 'male');

-- Birth date and sex live here, not on babies: babies has no RLS yet and grants ALL to anon.
CREATE TABLE "public"."baby_health_profiles" (
  "baby_id" uuid NOT NULL,
  "birth_date" date,
  "sex" "public"."baby_sex",
  "vaccine_schedule" text DEFAULT 'fr' NOT NULL,  -- CHECK IN ('fr', 'ca_qc'); decision 14
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid,
  CONSTRAINT "baby_health_profiles_pkey" PRIMARY KEY ("baby_id"),
  CONSTRAINT "baby_health_profiles_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  CONSTRAINT "baby_health_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "baby_health_profiles_birth_date_range" CHECK ("birth_date" IS NULL OR "birth_date" >= DATE '2000-01-01')
);

CREATE TABLE "public"."growth_measurements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "baby_id" uuid NOT NULL,
  "measured_on" date NOT NULL,
  "weight_g" integer,
  "length_mm" integer,               -- recumbent length < 24 months, standing height after
  "head_circumference_mm" integer,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid,
  CONSTRAINT "growth_measurements_pkey" PRIMARY KEY ("id"),
  -- FKs: baby_id -> babies ON DELETE CASCADE; created_by/updated_by -> users ON DELETE SET NULL
  CONSTRAINT "growth_measurements_has_value" CHECK (num_nonnulls("weight_g", "length_mm", "head_circumference_mm") > 0),
  CONSTRAINT "growth_measurements_weight_range" CHECK ("weight_g" IS NULL OR "weight_g" BETWEEN 300 AND 40000),
  CONSTRAINT "growth_measurements_length_range" CHECK ("length_mm" IS NULL OR "length_mm" BETWEEN 200 AND 1400),
  CONSTRAINT "growth_measurements_head_range" CHECK ("head_circumference_mm" IS NULL OR "head_circumference_mm" BETWEEN 200 AND 650),
  CONSTRAINT "growth_measurements_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500)
);
CREATE INDEX "growth_measurements_baby_date_idx" ON "public"."growth_measurements" ("baby_id", "measured_on" DESC);

CREATE TABLE "public"."vaccinations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "baby_id" uuid NOT NULL,
  "vaccine_code" text NOT NULL,      -- validated in the app against VACCINES (vaccine-schedule.ts)
  "vaccine_label" text,              -- required when vaccine_code = 'other'
  "dose_number" smallint,
  "given_on" date NOT NULL,
  "note" text,
  "created_at" / "created_by" / "updated_at" / "updated_by"  -- same as above
  CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id"),
  -- FKs as above
  CONSTRAINT "vaccinations_code_format" CHECK ("vaccine_code" ~ '^[a-z0-9_]{1,40}$'),
  CONSTRAINT "vaccinations_other_has_label" CHECK ("vaccine_code" <> 'other' OR "vaccine_label" IS NOT NULL),
  CONSTRAINT "vaccinations_label_length" CHECK ("vaccine_label" IS NULL OR char_length("vaccine_label") BETWEEN 1 AND 100),
  CONSTRAINT "vaccinations_dose_range" CHECK ("dose_number" IS NULL OR "dose_number" BETWEEN 1 AND 10),
  CONSTRAINT "vaccinations_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500)
);
CREATE INDEX "vaccinations_baby_date_idx" ON "public"."vaccinations" ("baby_id", "given_on" DESC);
-- One record per (vaccine, dose): a double tap or a duplicate MCP call fails with 23505.
CREATE UNIQUE INDEX "vaccinations_one_per_dose" ON "public"."vaccinations" ("baby_id", "vaccine_code", "dose_number")
  WHERE "dose_number" IS NOT NULL AND "vaccine_code" <> 'other';
```

### Grants and RLS (for each of the three tables, in the same migration)
- `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`
- `REVOKE ALL ON TABLE … FROM "anon", "authenticated";`. The baseline default privileges would
  otherwise grant ALL; this is the lesson from `harden_care_events_grants`.
- `GRANT SELECT, INSERT, DELETE ON TABLE … TO "authenticated";`. For `baby_health_profiles`, use
  `SELECT, INSERT` only: no delete. Do not use a plain `.upsert()` with the cookie client:
  PostgREST puts `baby_id` in the ON CONFLICT DO UPDATE SET list and `authenticated` has no
  UPDATE on `baby_id` (42501). `upsertHealthProfileCore` instead does
  `.upsert(row, { onConflict: 'baby_id', ignoreDuplicates: true })` followed by
  `.update({ birth_date, sex, updated_at, updated_by }).eq('baby_id', babyId)`. Cores always set
  `updated_at` server-side.
- Column-level UPDATE:
  - `growth_measurements`: `measured_on, weight_g, length_mm, head_circumference_mm, note,
    updated_at, updated_by`
  - `vaccinations`: `vaccine_code, vaccine_label, dose_number, given_on, note, updated_at,
    updated_by`
  - `baby_health_profiles`: `birth_date, sex, vaccine_schedule, updated_at, updated_by`
  - Never `baby_id`, `id`, `created_*`.
- `GRANT ALL … TO "service_role";` (the MCP path).
- Policies, `TO authenticated`:
  - `SELECT USING (is_baby_member(baby_id))`
  - `INSERT WITH CHECK (is_baby_admin(baby_id) AND created_by = auth.uid() AND (updated_by IS
    NULL OR updated_by = auth.uid()))`. For profiles: `is_baby_admin(baby_id) AND updated_by =
    auth.uid()`.
  - `UPDATE USING (is_baby_admin(baby_id)) WITH CHECK (is_baby_admin(baby_id) AND updated_by =
    auth.uid())`
  - `DELETE USING (is_baby_admin(baby_id))`
- No realtime publication change.
- Do **not** edit `.claude/plans/rls.md`. That rollout is owned by someone else. The migration
  header comment notes that these tables have had RLS since creation.

### Applying and types
- Apply: `mise run db_push`. If it fails with a TLS error, run
  `mise exec -- sh -c 'pnpm supabase db push --debug --yes --db-url "postgres://postgres.${POOLER_TENANT_ID}:${POSTGRES_PASSWORD}@${SUPABASE_DB_HOST}:${POSTGRES_PORT}/postgres?sslmode=disable"'`
  and filter the output through grep.
- Regenerate types: `mise run update_types`. It wraps `pnpm supabase gen types typescript
  --db-url … --schema public > src/utils/supabase/database.types.ts` with the mise env
  injected. That adds `Tables<'baby_health_profiles' | 'growth_measurements' | 'vaccinations'>`
  and `Enums<'baby_sex'>`.

## Reference data

### WHO growth standards (`src/utils/growth-who-data.ts`, generated)
- **Source**: WHO Child Growth Standards, "simplified field tables", z-score/LMS versions, by
  month, 0–5 years, from who.int/tools/child-growth-standards/standards. Files:
  - weight-for-age: `wfa_boys_0-to-5-years`, `wfa_girls_…`
  - length/height-for-age: `lhfa_boys_0-to-5-years`, `lhfa_girls_…` (the combined table:
    length 0–24 months, height 24–60 months)
  - head circumference-for-age: `hcfa_boys_0-to-5-years`, `hcfa_girls_…`
- **Shape**: `WHO_LMS: Record<'weight'|'length'|'head', Record<'female'|'male', readonly [month,
  L, M, S][]>>`, with month 0..60 and M in kg/cm. A header comment cites the source URL, the
  download date and "WHO Child Growth Standards (2006)".
- **Generation**: one-off. The builder downloads the six files and converts them with a
  throwaway script kept in the scratchpad, not the repo. The generated file is committed with a
  "generated, do not edit" note.
  - If the builder has no network access, the user downloads the six files and the builder
    converts them.
  - Spot-check against the published P50 values, for example boys' weight M at 0 months = 3.3464
    kg and girls' length M at 12 months = 74.0150 cm.
- **Math** (`src/utils/growth-who.ts`, pure and client-safe):
  - `ageInMonths(birthDate, date)` = days / 30.4375.
  - `lmsAt(indicator, sex, months)` interpolates linearly between monthly rows and returns null
    outside 0–60.
  - `valueAtZ({L,M,S}, z)` = `M·(1 + L·S·z)^(1/L)`.
  - `zScore(value, lms)` = `((value/M)^L − 1)/(L·S)`. Cap at ±5 for display; the WHO restricted
    tail adjustment beyond ±3 is ignored, which is fine for a family app.
  - `percentile(z)` uses a normal CDF (an erf approximation).
  - `PERCENTILES = [3, 15, 50, 85, 97]` (WHO standard set) with z values `[-1.881, -1.036, 0,
    1.036, 1.881]`.
  - Curves are generated by sampling `valueAtZ` at each month inside the chart window.
- **Length/height at 24 months**: the WHO table steps by about 0.7 cm at 24 months (recumbent
  length to standing height). Plot it as is (two segments, broken at 24 months) and note the
  change in the legend copy.

### Vaccine schedules (`src/utils/vaccine-schedule.ts`, client-safe config)
- Implemented (steps 3 and 3b): schedules are keyed by `VaccineScheduleKey` (`'fr' | 'ca_qc'`)
  in `VACCINE_SCHEDULES`, with ids `fr-2026` and `ca-qc-2026`. Vaccine codes are shared where the
  antigen is the same; a slot can accept `alsoCodes`. `computeVaccineStatus(scheduleKey,
  birthDate, today, shots)`. The Quebec rows come from Quebec.ca (PIQ summary, 2026-07-20); the
  file header records the doubts. All `ca_qc` slots are non-mandatory. The French table below is
  the original 2025 draft; the code is the source of truth.
- Original French draft: `SCHEDULE_ID = 'fr-2025'`. The source is the *Calendrier des vaccinations et recommandations
  vaccinales 2025* (Ministère de la Santé / HAS).
- **The builder must check every row below against the current official calendar before
  committing**, and bump `SCHEDULE_ID` if the 2026 edition changed anything. The table below is
  from memory of the 2025 edition.
- `VACCINES`: `{ code, i18n key, inSchedule }` for:
  - in the schedule: `dtcap_hib_hepb` (hexavalent), `pcv` (pneumococcal), `rotavirus`, `menb`,
    `menacwy`, `mmr` (ROR), `dtcap` (booster at 6 years);
  - extra, recordable only: `menc`, `bcg`, `hepb`, `varicella`, `influenza`, `covid`,
    `nirsevimab` (Beyfortus, an RSV immunisation that parents log in the carnet), `other`.
- `SCHEDULE`: rows of `{ id, vaccineCode, dose, fromMonths, untilMonths, mandatory, optional? }`.
  `untilMonths` is when the dose becomes overdue.

  | id | vaccine | dose | from | until (overdue after) | mandatory |
  |---|---|---|---|---|---|
  | hexa-1 | dtcap_hib_hepb | 1 | 2 | 3 | yes |
  | pcv-1 | pcv | 1 | 2 | 3 | yes |
  | rota-1 | rotavirus | 1 | 2 | 3 | no (recommended) |
  | menb-1 | menb | 1 | 3 | 4 | yes (born ≥ 2025) |
  | rota-2 | rotavirus | 2 | 3 | 4 | no |
  | hexa-2 | dtcap_hib_hepb | 2 | 4 | 5 | yes |
  | pcv-2 | pcv | 2 | 4 | 5 | yes |
  | rota-3 | rotavirus | 3 | 4 | 5 | no, `optional` (3-dose product only, never "overdue") |
  | menb-2 | menb | 2 | 5 | 6 | yes |
  | menacwy-1 | menacwy | 1 | 6 | 7 | yes |
  | hexa-3 | dtcap_hib_hepb | 3 | 11 | 12 | yes |
  | pcv-3 | pcv | 3 | 11 | 12 | yes |
  | mmr-1 | mmr | 1 | 12 | 13 | yes |
  | menb-3 | menb | 3 | 12 | 13 | yes |
  | menacwy-2 | menacwy | 2 | 12 | 13 | yes |
  | mmr-2 | mmr | 2 | 16 | 18 | yes |
  | dtcap-6y | dtcap | 1 | 72 | 84 | no (recommended) |

- **Status** (`src/utils/vaccine-status.ts`, pure). Inputs: `computeVaccineStatus(birthDate,
  today, shots)`.
  - `dueFrom = addMonths(birthDate, fromMonths)`, `dueBy = addMonths(birthDate, untilMonths)`,
    using date-fns calendar months on `yyyy-MM-dd` strings.
  - A slot is **given** when a shot exists with the same `vaccine_code` and `dose_number`. The
    matched shot is returned with it.
  - Otherwise the slot is:
    - **overdue** if `today > dueBy`, unless the row is `optional`;
    - **due** if `dueFrom ≤ today ≤ dueBy`;
    - **soon** if `today ≥ dueFrom − 30 days`;
    - **upcoming** in all other cases.
  - Shots that match no slot (`other`, the extra codes, or a dose beyond the schedule) come back
    in `unscheduled`.
  - Without a birth date, the schedule is still shown with relative ages ("at 2 months") and no
    status.
  - Unit-test-worthy edge cases (no test runner exists, so they become verify steps):
    - birth on the 31st plus 1 month;
    - shots recorded before the birth date (rejected by validation);
    - a dose recorded twice (unique index → `duplicateDose`).

## Access and security
- **Page** `/baby/[babyId]/health`: `assertPageAccess(babyId, 'health')`. The registry entry is
  `defaultRole: 'admin'`, `defaultEnabled: false`, `manageable: true`, so the page is off until an
  admin enables it. Non-members, a disabled page and a wrong role are all redirected (existing
  behavior).
- **Cores** (`src/utils/health-core.ts`, `import 'server-only'`, deliberately not
  `'use server'`). Every core:
  - validates `babyId` as a UUID;
  - calls `assertPageAccessForUser(supabase, userId, babyId, 'health')`, which returns the level;
  - for writes, additionally requires `level === 'admin'` (`actionError('unauthorized')`);
  - scopes every query with `.eq('baby_id', babyId)`. Update and delete by id also carry the
    `baby_id` filter, so an id from another baby matches nothing and returns `notFound`.
- **Server Actions** (`src/utils/actions/health.ts`): `getAuthUser()` (verifies via
  `getUser()`), then the core with the cookie client, so RLS applies as a second layer.
  Mutations `revalidatePath(`/baby/${babyId}/health`)`.
- **MCP tools** (`src/app/api/mcp/tools/health.ts`): `ctx.userId` comes from a verified
  `lpm_`/`lpma_` token. The tools call the same cores with the service-role client. RLS is
  bypassed there by design, which is why the cores repeat the page and admin checks. No new
  endpoint, scope or auth change.
- **Service role**: only via the existing MCP path. No new service-role use.
- **No public exposure**: no share-link, feed, digest or email path reads these tables.
- **Logging**: child loggers with `{ function, babyId }`. Never log measurement values, birth
  date, sex or vaccine names, only ids and counts.

## Steps
Each step is one Conventional Commit, followed by the CHANGELOG follow-up commit
(`docs: update CHANGELOG.md for <hash>`). Run `pnpm typecheck && pnpm lint` before each commit.
The app keeps working after every step.

1. **`feat(db): create health tables with RLS`**. Add the migration above.
   - Files: `supabase/migrations/<ts>_create_health.sql`
   - **Checkpoint**: run the reviewer on the migration only (it is additive and nothing reads it
     yet). Once it is green, apply it and run `mise run update_types` (see "Applying and
     types"). Commit `chore(db): regenerate types for health tables`.
   - Files for the types commit: `src/utils/supabase/database.types.ts`
2. **`feat(health): add WHO growth reference data and LMS helpers`**. Generate the data file
   and the pure math (see "Reference data").
   - Files: `src/utils/growth-who-data.ts`, `src/utils/growth-who.ts`
3. **`feat(health): add French vaccine schedule and status helpers`**.
   - Files: `src/utils/vaccine-schedule.ts`, `src/utils/vaccine-status.ts`
4. **`feat(health): add health validation and server cores`**.
   - `src/utils/health-validation.ts`:
     - `HealthValidationError` with keys `notFound | invalidDate | future | beforeBirth |
       noMeasurement | invalidWeight | invalidLength | invalidHead | invalidVaccine |
       labelRequired | invalidDose | duplicateDose | noteTooLong | missingBirthDate |
       missingSex`.
     - A `HealthResult` type and a `HEALTH_LIMITS` object that mirrors the SQL CHECKs.
     - Dates must be valid `yyyy-MM-dd`, not in the future (today via `todayInZone`) and not
       before the birth date when one is set.
     - The birth date must not be in the future.
   - `src/utils/health-core.ts` exports:
     - `getHealthProfileCore` and `upsertHealthProfileCore`;
     - `listGrowthMeasurementsCore`, `createGrowthMeasurementCore`,
       `updateGrowthMeasurementCore` and `deleteGrowthMeasurementCore`;
     - `listVaccinationsCore`, `createVaccinationCore` (auto dose number; 23505 →
       `duplicateDose`), `updateVaccinationCore` and `deleteVaccinationCore`;
     - `getUpcomingVaccinesCore` (profile + shots → `computeVaccineStatus`).
     - Lists return creator names with the same approach as `withCreatorNames` in
       `care-core.ts`. Copy it locally; extracting a shared helper is optional and out of scope.
   - Files: `src/utils/health-validation.ts`, `src/utils/health-core.ts`
5. **`feat(health): add health server actions`**. Thin wrappers that return `HealthResult`,
   copying `care_events.ts` (`requireUserId`, `toResult`).
   - Files: `src/utils/actions/health.ts`
6. **`feat(health): register health page`**:
   - Add `'health'` to `PageId` and `PAGE_REGISTRY` (icon `HeartPulse` from lucide,
     `defaultRole: 'admin'`, `defaultEnabled: false`, `manageable: true`, placed after
     `tracker`). It is not added to `PRIMARY_PAGE_IDS`.
   - Add `pages.health.*` messages.
   - Add a minimal page: `assertPageAccess`, the `Reveal` header, and data loading wired.
   - Add `loading.tsx` and `error.tsx` copied from the tracker.
   - Nav, landing card and admin page settings pick the page up from the registry.
   - Files: `src/utils/page_registry.ts`, `src/app/baby/[babyId]/health/{page,loading,error}.tsx`,
     `messages/en.json`, `messages/fr.json`
7. **`feat(health): birth date and sex profile form`**. Shown when the profile is incomplete
   and editable afterwards; admins only. Behavior:
   - The form also has a vaccine schedule choice (France / Quebec, default France), saved with
     the profile and changeable later. `upsertHealthProfileCore` validates it with
     `isVaccineScheduleKey`.
   - Without a birth date, curves and vaccine status are replaced by a prompt.
   - Without a sex, the measurement list still works, but the curves are replaced by a prompt
     to set it.
   - Files: `src/app/baby/[babyId]/health/_components/*`
8. **`feat(health): growth measurements log`**. Add, edit and delete (with confirm through
   `confirm_provider`).
   - Input in kg (up to 3 decimals) and cm (1 decimal), converted to g and mm on the server.
   - The list shows age at measurement (from `growth-who.ts`) and the percentile per metric
     when the profile is complete.
   - Files: `health/_components/*`
9. **`feat(health): WHO growth chart`**:
   - `src/utils/growth-chart.ts` exports a pure `buildGrowthChart({ indicator, sex, birthDate,
     measurements, windowMonths })`, which returns the axis ticks, percentile paths and points.
   - An SVG component renders it, with one chart per indicator.
   - The window defaults to the smallest of 6, 12, 24 or 60 months that covers the baby's
     current age plus 1 month.
   - Measurements outside 0–60 months are omitted from the chart but stay in the list.
   - Files: `src/utils/growth-chart.ts`, `health/_components/growth_chart.tsx`
10. **`feat(health): vaccinations log and upcoming schedule`**:
    - The upcoming view and the "Mark as given" prefill use the baby's `vaccine_schedule`. The
      source line names the schedule in use (`vaccines.scheduleSource.fr` / `.ca_qc`). The
      mandatory badge is hidden when a schedule has no mandatory slots.
    - Record, edit and delete shots: vaccine picker from `VACCINES`, a label field for `other`,
      the dose number prefilled with the next dose, a date and a note.
    - Upcoming view: overdue, due and soon slots first, then upcoming, then given.
    - Shots that match no slot are listed separately.
    - Mandatory and recommended slots are marked.
    - Files: `health/_components/*`
11. **`feat(mcp): add health tools`**:
    - In `tools/shared.ts`, teach `run()` to translate `HealthValidationError` via
      `health.errors.codes`.
    - Add `'health'` to `MCP_AREAS` and to the `list_babies` description in `tools/babies.ts`.
    - Create `tools/health.ts` and register it in `tools/index.ts`.
    - Tools (descriptions in English, like the others):
      - `set_health_profile` (decision 9): optional `birthDate`, `sex` and `vaccineSchedule`
        (`z.enum(['fr', 'ca_qc'])`), admin only through `upsertHealthProfileCore`.
      - `get_health_summary` (read-only): birth date, sex, vaccine schedule, age in days and months, the latest
        value and percentile per metric, and counts.
      - `list_growth_measurements` (read-only; optional `from` and `to` days, `limit` default
        50): each entry has `measuredOn`, `ageMonths`, `weightKg`, `lengthCm`,
        `headCircumferenceCm`, a percentile per metric (null without a profile), `note` and
        `createdBy`.
      - `add_growth_measurement`: `measuredOn` day (default today in `timeZone`) and at least
        one of `weightKg`, `lengthCm`, `headCircumferenceCm`, plus an optional `note`.
      - `delete_growth_measurement` (`destructiveHint`).
      - `list_vaccinations` (read-only): the shots given.
      - `add_vaccination`: `vaccineCode` (`z.enum` of the codes, each described with its common
        French name so the model maps "le ROR" to `mmr`), `vaccineLabel` (required for
        `other`), optional `doseNumber` (auto-assigned), `givenOn` (default today) and `note`.
      - `delete_vaccination` (`destructiveHint`).
      - `list_upcoming_vaccines` (read-only; optional `withinMonths`, default 6). Returns
        overdue, due, soon and upcoming slots with `dueFrom`/`dueBy` and the schedule id. It
        errors with the `missingBirthDate` text when the birth date is not set.
    - Files: `src/app/api/mcp/tools/{health,shared,babies,index}.ts`
12. **`docs(plans): mark health implemented`**. Add the `## Status: implemented` section and
    move the plan to `.claude/plans/done/`.

## Translations
New keys, in both `messages/en.json` and `messages/fr.json`:
- `pages.health.{name,eyebrow,description}`: FR "Santé", "Page — Santé", "Courbes de
  croissance et vaccins."; EN "Health".
- `health`:
  - `title`, `subtitle`
  - `profile.{heading,birthDate,sex,female,male,missingBirthDate,missingSex,save,saved}`
  - `growth.{heading,add,edit,delete,deleteConfirm,date,weight,length,head,note,unitKg,unitCm,
    age,percentile,empty,lengthHeightNote}`
  - `growth.indicators.{weight,length,head}`
  - `chart.{percentileLabel,ageAxis,monthsShort,yearsShort,windowLabel,source}`. `source` reads
    "WHO Child Growth Standards" / "Normes de croissance de l'OMS".
  - `vaccines.{heading,add,edit,delete,deleteConfirm,vaccine,label,dose,date,note,upcoming,
    given,unscheduled,mandatory,recommended,optionalDose,atAge,empty}`
  - `vaccines.status.{given,overdue,due,soon,upcoming}`
  - `vaccines.names.<code>`, one per `VACCINES` code. FR names: "DTCaP-Hib-HepB (hexavalent)",
    "Pneumocoque", "Rotavirus", "Méningocoque B", "Méningocoque ACWY", "ROR", "DTCaP (rappel)",
    "Méningocoque C", "BCG", "Hépatite B", "Varicelle", "Grippe", "COVID-19", "Beyfortus
    (nirsévimab)", "Autre".
  - `vaccines.scheduleSource.{fr,ca_qc}`: FR "Calendrier vaccinal français 2026" and "Programme
    québécois d'immunisation 2026"; EN "French vaccination calendar 2026" and "Québec
    immunisation program 2026". Also `profile.vaccineSchedule`, `profile.scheduleFr`,
    `profile.scheduleCaQc`, and names for the new codes `dtcap_hib`, `mmrv`, `hepa_hepb`, `hepa`.
  - `errors.codes.<HealthErrorKey>` for every validation key in step 4.
  - `duration`/age formatting: `age.{days,months,years}` with ICU plurals.
- `serverErrors`: none new. `unauthorized` and `unauthenticated` already exist.

The Design section's Copy table lists the full key set the screens need. It extends and, where it
differs, supersedes the list above.

## Design

Conventions reused from the tracker (`src/app/baby/[babyId]/tracker/`): page shell
`mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-16` with `Reveal` header (`font-display text-2xl
font-semibold sm:text-3xl`, subtitle hidden on mobile); cards `rounded-2xl border
border-landing-border bg-landing-surface`; section headings `text-xs font-semibold uppercase
tracking-wider text-muted-foreground`; list rows as full-width buttons like `care_log_row.tsx`
(`min-h-16`, chevron, focus ring); forms in `Modal` (`src/components/modal.tsx`) with a
`flex-1 space-y-4 overflow-y-auto p-5` body and a footer bar; destructive confirm via
`useConfirm()`; errors via `sonner` toasts; offline via the `useOnline` hook. Colours come only
from tokens (`primary`, `muted-foreground`, `destructive`, `chart-1..5`, `sage`, `rose`,
`landing-*`), which already have dark variants in `src/app/globals.css`, so no dark-mode-specific
work is needed. Dialogs, not sheets: the app has no sheet primitive and every other form is a
`Modal` (centered, `max-w-[460px]`, `max-h-[90dvh]`).

### User flow
1. Admin opens Health from the nav → sees the page header, a profile card, and the **Growth** view
   (default). A viewer sees the same page with no add/edit controls (depends on open question 1).
2. Profile incomplete → the profile card is an inline form (birth date + sex). Admin saves →
   toast "Profile saved", the page refreshes and the card collapses to a one-line summary.
3. Growth: pick an indicator (Weight / Length / Head) and an age window (6 m / 1 y / 2 y / 5 y) →
   the chart redraws. Tap a dot → the readout card under the chart shows that measurement.
4. Tap "Add a measurement" → modal: date (today), three optional fields (kg, cm, cm), note, with a
   live percentile hint → Save → modal closes, toast "Measurement saved", list and chart refresh.
5. Tap a list row → same modal in edit mode; "Delete" in the footer → confirm dialog → deleted.
6. Tap "Vaccines" in the view switch → URL becomes `?view=vaccines` → "To do" section (overdue,
   due, soon), "Coming up", "Already given", and "Other vaccines".
7. On a due or overdue slot tap "Mark as given" → the vaccine modal opens with vaccine, dose and
   today's date prefilled → Save → the slot moves to "Already given".
8. Tap "Record a vaccine" (not tied to a slot) → empty vaccine modal; choosing "Other" reveals a
   name field.

### Screens

#### Page shell, profile card and view switch
Wireframe (mobile, 375px):
```
+---------------------------------------+
| Santé                                  |  <- font-display h1
|----------------------------------------|
| +------------------------------------+ |
| | Née le 3 mars 2026 · 7 mois  [Modifier]| |  profile card (complete)
| | Fille                               | |
| +------------------------------------+ |
|                                        |
| [ Croissance ]  [ Vaccins (2) ]        |  view switch, h-12
|                                        |
|  ... active view ...                   |
+---------------------------------------+
```
Profile incomplete (admin):
```
| +- - - - - - - - - - - - - - - - - - -+ |
| | Pour afficher les courbes et le      | |
| | calendrier, ajoutez la naissance.    | |
| | DATE DE NAISSANCE                    | |
| | [ jj/mm/aaaa                      ]  | |
| | SEXE                                 | |
| | [ Fille ]        [ Garçon ]          | |
| | Utilisé uniquement pour choisir la   | |
| |  courbe de référence OMS.            | |
| |                       [ Enregistrer ]| |
| +- - - - - - - - - - - - - - - - - - -+ |
```
- Layout: header block as tracker. Profile card full width, `p-4`, dashed border
  (`border-dashed`) when incomplete, solid when complete. Summary line: baby's age in the
  `age.*` format, birth date long-formatted with the existing `formatting.ts` helpers, sex label.
  "Edit" is a `Button variant="ghost" size="lg"` (44px) at the right, admins only. Below the
  profile card, the view switch, then the active view with `mt-6 space-y-8`. At `md` and wider the
  shell stays `max-w-4xl`; the profile card and switch stay full width.
- Components: new `profile_card.tsx` (client, owns the inline form and an edit `Modal`),
  `view_switch.tsx` (server). Reuse `Modal`, `ChoiceGroup` (two options, `size="md"`), `Input`
  (`type="date"`, `h-11`, `max` = today, matches the tracker's native `datetime-local` use, so no
  `Popover`/`Calendar` and no z-70 concern), `Button`, `Label` with the tracker's `labelClass`.
  One `ProfileForm` is rendered inline when the profile is incomplete and inside a `Modal` when
  editing a complete one.
- View switch: not ARIA tabs. It is a `<nav aria-label>` with two `next/link` items
  (`?view=growth|vaccines`, `scroll={false}`, `aria-current="page"` on the active one), styled
  like a `ChoiceGroup` (`h-12 rounded-2xl border`, active `border-primary bg-primary/15` plus a
  check icon, so the state is not colour only). It is links because the view is in the URL.
  The page fetches both datasets on every render (small), so switching is near-instant.
  The Vaccines item shows a count badge (`Badge variant="destructive"`) of overdue shots when
  there are any; the badge has `aria-label` "2 overdue" and a sr-only text.
- Typography and color: see conventions. Sex label is neutral text, no pink/blue.
- Interactions: Save is disabled until the date is valid (not future); sex is optional at save,
  and saving with only one of the two is allowed (partial profiles are valid states).

#### Growth view
Wireframe (mobile):
```
| POIDS · LONGUEUR · PÉRIMÈTRE CRÂNIEN   |
| [ Poids ][ Taille ][ Crâne ]           |  ChoiceGroup indicator, h-12
| [ 6 m ][ 1 an ][ 2 ans ][ 5 ans ]      |  ChoiceGroup window, h-12
|                                        |
| kg                                     |
| 9 |                          ___ P97   |
|   |                   _.--''           |
| 7 |            _.--'''      --- P85   |
|   |       .--'    o--o                 |
| 5 |   .--'     o'          === P50   |
|   | .'    o'                           |
| 3 |'                         --- P15   |
|   +------+------+------+------+---     |
|   0      1      2      3      4  mois  |
|  ~ Courbes OMS filles ~                |
| +------------------------------------+ |
| | 12 mars 2026 · 4 mois et 12 j      | |  readout card (selected point)
| | 6,2 kg        P48                  | |
| +------------------------------------+ |
| Taille: courbe à 24 mois: couchée->debout (note)
|                                        |
| MESURES                [+ Ajouter]     |
| +------------------------------------+ |
| | 12 mars 2026 · 4 mois           >  | |
| | 6,2 kg P48 · 62,5 cm P41 · 40 cm P55| |
| | Par Marie                           | |
| +------------------------------------+ |
```
Desktop (`md` and up): `md:grid md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-start
md:gap-8`, the same split as the tracker. Left: indicator/window controls, chart, readout (the
column is `md:sticky md:top-24`). Right: the measurement list. Controls are `ChoiceGroup`s in both.

**The chart (`growth_chart.tsx`, client component, hand-rolled SVG)**
- Decision: hand-rolled SVG is enough, no recharts. Reasons: the chart is static reference curves
  plus at most a few dozen dots; all interactions needed are "select a dot, read its value" which a
  tap-to-select readout covers better on a phone than hover tooltips (hover does not exist on
  touch); no zoom or brush is wanted; recharts would add about 100 KB gzipped and a
  Tailwind/token-adapter layer for a handful of users on phones. This answers open question 6
  for the design side only; the user still decides.
- Size: `<svg viewBox="0 0 360 260" className="h-auto w-full">` so it scales to the container
  with 1 unit about 1 CSS px at 375px. Plot margins: left 40, right 30, top 16, bottom 32. At `md`
  the container is about 480px wide, so everything scales by 1.3x; text stays above 11px.
- Axes: x is age in months (linear). Ticks by window: 6 m → every month `0..6`; 1 y → `0,3,6,9,12`;
  2 y → `0,6,12,18,24`; 5 y → `0,12,24,36,48,60`. Labels are the number only, with the unit
  ("mois"/"months", "an(s)" for the 5 y window ticks `1 an`, `2 ans`) once on the axis title.
  y is the indicator value, domain = min of P3 and max of P97 over the window, widened to include
  any plotted point, then "nice" 4–5 ticks; unit label ("kg", "cm") at the top left of the axis.
  Gridlines: horizontal only, `stroke-border`, 1px, no vertical gridlines.
- Percentile bands: P3–P97 filled with `fill-primary/10`; P15–P85 filled with `fill-primary/15`
  on top (so the centre reads darker); P50 is a 1.5px `stroke-primary/60` line. P3, P15, P85, P97
  are drawn only as band edges (no extra strokes, 1px `stroke-primary/30`). End-of-curve labels
  "3", "15", "50", "85", "97" in `fill-muted-foreground` 11px at the right margin, with a
  "P" prefix only on the first one ("P3") to save width. Never colour-code "good/bad": the bands
  are neutral.
- Baby's points: a 2.5px `stroke-foreground` polyline joining points chronologically (only when 2
  or more), dots `r=4.5` filled `fill-chart-1` with a 2px `stroke-landing-surface` outline for
  contrast over bands. The selected dot gets an extra ring (`r=9`, `stroke-chart-1`, no fill,
  `motion-safe:transition-all`). Points at the same age: all drawn. Measurements outside the
  window or outside 0–60 months are omitted; a line under the chart says "2 measurements are
  outside this period" when that happens.
- 24 months (length only): a dashed vertical hairline at x=24 with the tiny label "24 m" and the
  curve broken into two segments (no connecting line across the step). A one-line note under the
  chart on 2 y and 5 y windows: `growth.lengthHeightNote`.
- Touch and keyboard: each dot has a transparent hit circle `r=22` (44px) that is the real
  interactive element (`<g role="button" tabindex="0">` with an `aria-label` like "12 March 2026,
  4 months, 6.2 kg, 48th percentile"). Tap/Enter/Space selects it; Left/Right arrows move to the
  previous/next measurement. There is no hover tooltip and no long-press. The latest measurement is
  selected by default, so the readout is never empty and nothing needs discovering. Overlapping hit
  areas (5 y window): nearest dot wins via DOM order by date, acceptable since the list below has
  every value. Pointer-events on the bands are off so scrolling the page by dragging over the chart
  is not captured (`touch-action: pan-y` on the svg).
- Readout card (selected point), below the chart, not floating, so no z-index needed:
  `rounded-2xl border border-landing-border bg-landing-surface p-3`, line 1 date and age, line 2
  value in `font-display text-xl` and the percentile as `Badge variant="secondary"` ("P48"), and
  a line with the reference "Median for this age: 6.4 kg". `aria-live="polite"` so a screen reader
  hears the new selection.
- Legend: one small line under the readout: shaded area = "Between P3 and P97, 94% of babies", the
  source "WHO Child Growth Standards", and the disclaimer "For information only, ask your
  paediatrician". Text `text-xs text-muted-foreground`.
- Animation: none (no draw-in). Only the selected-ring transition, wrapped in `motion-safe:`.

**Measurement list**
- Rows copy `care_log_row.tsx`: a `<button>` per row, `min-h-16`, chevron, `focus-visible:ring-3`.
  Content: line 1 `font-semibold` date + age ("12 Mar 2026 · 4 months"); line 2 the values that
  exist, each as `6.2 kg` followed by a percentile chip `P48` (`Badge variant="secondary"`, only
  when the profile is complete and the age is within 0–60 months); line 3 the note
  (`line-clamp-2`); line 4 "By {name}" in `text-xs text-muted-foreground`. Values wrap onto
  extra lines instead of truncating (French is longer). Newest first.
- For viewers, rows render as non-interactive `<div>`s with no chevron.
- Percentile text: "P48"; "<P1" and ">P99" at the extremes. Colour is never the signal. A value
  outside P3–P97 is not highlighted in red; it only gets the "P" chip as usual (the app is not a
  diagnostic tool).

#### Growth: missing-profile states
- No birth date: the chart area is replaced by a card (dashed border, same style as
  `CareLog` empty state) with the heading "Add the birth date to see the curves" and, for admins,
  a "Set birth date" button that scrolls to and focuses the profile form; for viewers, the text
  "An administrator needs to add the birth date." The list stays visible without ages and
  percentiles (rows show only the date and values).
- Birth date but no sex: card "Choose girl or boy to show the WHO curves", with the sex
  `ChoiceGroup` inline and a Save button (admins), or the viewer text. The list shows ages but no
  percentiles. Depends on open question 3: if the user wants a reference choice without recording
  sex, the label becomes "Reference curves" with the same two options and the copy changes
  (see Questions).
- Both missing: the birth date prompt wins; the sex field sits in the profile card above.
- Measurement with a date before the birth date can exist only if the profile changed afterwards;
  its row shows the date without age, and a muted line "Before the birth date" (`beforeBirth`).

#### Growth: add/edit measurement modal (`growth_modal.tsx`)
Wireframe:
```
+-----------------------------------+
| + Ajouter une mesure           [x]|
|-----------------------------------|
| DATE                              |
| [ 29/10/2026                   ]  |
| POIDS                             |
| [ 6,2          ] kg               |
|   ≈ P48 pour 4 mois               |
| TAILLE                            |
| [              ] cm               |
| PÉRIMÈTRE CRÂNIEN                 |
| [              ] cm               |
| NOTE                              |
| [                              ]  |
|-----------------------------------|
| [Supprimer]       [Annuler][Enreg]|
+-----------------------------------+
```
- Component: `Modal` + the tracker's form pattern (`touched` map, `errorText`, footer with
  `type="submit" form="..."`, `saving` disables dismissal, Loader2 spinner).
- Fields and units:
  - Date: `Input type="date"`, `max` = today (in the request zone), `min` = birth date when set,
    default today.
  - Weight: `type="text" inputMode="decimal"`, unit label "kg" to the right (`aria-hidden`; the
    unit is in the `Label` text: "Weight (kg)"), `className="h-11 w-32"`. Accepts `,` or `.`;
    normalise to `.` on parse. Max 3 decimals. Valid 0.3–40. Placeholder `3,450`.
  - Length/height: same, unit cm, 1 decimal, valid 20–140. Label "Length (cm)". The label switches to
    "Height (cm)" when the chosen date puts the baby at 24 months or more.
  - Head circumference: same, cm, 1 decimal, valid 20–65.
  - Note: textarea exactly as the tracker's (`rows=3`, `maxLength=500`, counter after 400).
- Validation (inline, on blur and after first change, `role="alert"`, `aria-invalid`,
  `aria-describedby`): invalid number; out of range ("Weight must be between 0.3 and 40 kg");
  date in the future; date before birth; none of the three values filled ("Enter at least one
  measurement"; shown near the Save button and Save stays disabled). Server errors come back
  through `errors.codes.*` in a toast.
- Plausibility hint (non-blocking, optional but cheap since the maths exists): under a filled
  field, when sex and birth date are known, show `≈ P48 for 4 months` in `text-sm
  text-muted-foreground`. If the value is beyond about ±4 SD show instead "Unusual value, please
  double check" in `text-sm` with an `AlertTriangle` icon. It catches `62` typed for `6,2`
  without blocking a real outlier. Hidden entirely when the profile is incomplete.
- Edit mode: same form, title "Edit measurement", footer shows the destructive "Delete" on the
  left (`Button variant="destructive"` with `Trash2`), identical to `care_event_modal.tsx`.
- Delete: `useConfirm()` with title "Delete the 12 March 2026 measurement?", `confirmLabel`
  "Delete", `destructive: true`. The confirm dialog is the existing `ConfirmProvider` nested in
  `Modal`, so z-index is already correct (`z-[60]` overlay, `z-[70]` for the Select). After
  success: modal closes, toast "Measurement deleted", `router.refresh()`.

#### Vaccines view
Wireframe (mobile):
```
| [Enregistrer un vaccin]                 |  full-width outline button, h-11+
|                                         |
| À FAIRE                                  |
| +-------------------------------------+ |
| | (!) Hexavalent · dose 1             | |  overdue
| |  Obligatoire · à 2 mois             | |
| |  À faire avant le 3 mai 2026        | |
| |  [En retard]   [Marquer comme fait] | |
| +-------------------------------------+ |
| | (clock) ROR · dose 1                | |  due
| |  Obligatoire · à 12 mois            | |
| |  Du 3 mars au 3 avr. 2027  [À faire]| |
| |  [Marquer comme fait]               | |
| +-------------------------------------+ |
|                                         |
| À VENIR                                 |
| 16 mois                                 |  age subheading
| +-------------------------------------+ |
| | (o) ROR · dose 2          [À venir] | |
| |  Obligatoire · dès le 3 juil. 2027  | |
| +-------------------------------------+ |
| [Voir tout le calendrier v]             |  <details> beyond the next 2 age groups
|                                         |
| DÉJÀ FAITS (5)                          |
| +-------------------------------------+ |
| | (✓) Hexavalent · dose 1          >  | |
| |  Fait le 5 mai 2026 · Par Marie     | |
| +-------------------------------------+ |
|                                         |
| AUTRES VACCINS                          |
| | BCG · 4 mars 2026              >   | |
|                                         |
| Source : Calendrier vaccinal français 2025 |
```
- Layout: single column at all widths (`space-y-8`), `max-w-2xl` inner column at `md` for
  readable line lengths. Order: record button; "To do" (overdue first, then due, then soon, each
  sorted by due date); "Coming up" (upcoming grouped by age with small `text-sm font-semibold`
  age sub-headings, the first two groups open, the rest inside a native `<details>`/`<summary>`
  "Show the full schedule", which keyboard and screen readers handle for free); "Already given"
  (newest first); "Other vaccines" (shots that match no slot, newest first); footer line with the
  schedule source and a disclaimer ("Always check the carnet de santé and your doctor's advice").
  Empty sections are omitted.
- Slot card: `rounded-2xl border bg-landing-surface p-3`, left status icon in a 40px circle
  (same construction as the tracker's kind icon), then name + dose (`font-semibold`), then
  `text-sm text-muted-foreground` line 2 "Mandatory · at 2 months" and line 3 the date range
  (when a birth date exists). Status badge (`Badge`) top right, wraps under the name if tight.
  Primary action "Mark as given" as `Button variant="outline" size="lg"` full width on mobile
  (`w-full sm:w-auto`), only on overdue, due and soon slots, admins only, hidden offline's
  action is disabled (see States).
- Status states (every state = icon + text, never colour alone):

  | State | Icon (lucide) | Badge | Tint | When |
  |---|---|---|---|---|
  | Overdue | `AlertCircle` | "Overdue" `Badge variant="destructive"` | `bg-destructive/10 text-destructive` icon circle | past the "until" date and not given |
  | Due | `Syringe` | "Due now" `Badge variant="default"` | `bg-primary/15 text-primary` | inside the window |
  | Soon | `CalendarClock` | "Soon" `Badge variant="secondary"` | `bg-chart-4/15 text-chart-4` | within 30 days of the window |
  | Upcoming | `Circle` | "Upcoming" `Badge variant="outline"` | `bg-muted text-muted-foreground` | later |
  | Given | `Check` | "Given" `Badge variant="secondary"` + date | `bg-sage/15 text-sage` | a matching shot exists |

  Overdue wording stays calm: "Overdue" with the date "was due before 3 May 2026", never red
  full-width banners, no exclamation marks in copy.
- Recommended vs mandatory: text label line 2 ("Mandatory" / "Recommended"), plus for the
  optional rotavirus dose 3 the extra text "Only with the 3-dose product" (`optionalDose`), which
  never becomes overdue and is always listed under "Coming up".
- Given row: whole row is a button opening the vaccine modal in edit mode (admins); a viewer's is
  a plain `div`. It shows name, dose, the date given and "By {name}". Optional note `line-clamp-2`.
- "Mark as given" opens the vaccine modal prefilled (vaccine, dose, date = today) rather than
  saving instantly, because a health record should not be created by a single stray tap, and
  Save is then one tap anyway. See Questions for the alternative.

#### Vaccines: missing-profile state
- No birth date: show a dashed card at the top "Add the birth date to see which vaccines are due"
  (admin: button to the profile form; viewer: text). Below it, the schedule is still shown in
  "Coming up" style grouped by age ("At 2 months"), with no status badges, no dates, and no
  "Mark as given" buttons (the record button still works). "Already given" and "Other vaccines"
  still show. Sex is not needed for vaccines, so a missing sex has no effect here.

#### Vaccine add/edit modal (`vaccine_modal.tsx`)
Wireframe:
```
+-----------------------------------+
| + Enregistrer un vaccin        [x]|
|-----------------------------------|
| VACCIN                            |
| [ Hexavalent                  v ]  |  Select
| NOM DU VACCIN        (if Autre)   |
| [                              ]  |
| DOSE                              |
| [ 2 ]                             |
| DATE                              |
| [ 29/10/2026                   ]  |
| NOTE                              |
| [                              ]  |
|-----------------------------------|
| [Supprimer]       [Annuler][Enreg]|
+-----------------------------------+
```
- Vaccine: `components/ui/select.tsx` (portals at `z-[70]`, above the `z-[60]` Modal, already
  documented in `docs/z-index.md`). Options: scheduled vaccines first, then a separator and the
  extras, "Other" last. Native-feeling on mobile via the Select's own list; 15 options fit
  without search.
- Name field: only when "Other"; required, max 100 characters.
- Dose: `type="text" inputMode="numeric"`, `w-24`, `h-11`, prefilled to the next dose number and
  re-computed when the vaccine changes (until the user edits it). 1–10. Optional for "Other".
  Helper under it: "Next dose: 2" when it was auto-filled.
- Date: `type="date"`, `max` today, `min` birth date, default today (or, when opened from a slot,
  today as well; the user can pick an earlier date).
- Note: same textarea as above.
- Errors: `duplicateDose` shown inline under Dose ("Dose 2 of this vaccine is already recorded")
  after a failed save; `labelRequired` under the name field; `beforeBirth`, `future` under the
  date.
- Edit mode and delete: identical to the growth modal; confirm title "Delete the hexavalent dose 1
  record?".

### States
- Loading: `health/loading.tsx` copies the tracker's pattern (`role="status" aria-live="polite"`,
  sr-only `common.loading`, `aria-hidden` skeleton with `animate-pulse bg-muted`). Skeleton: title
  pill, profile card block (`h-20 rounded-2xl`), view switch (`h-12 rounded-2xl`), a chart block
  (`aspect-[360/260] rounded-2xl`), then three `h-16 rounded-2xl bg-muted/70` rows. Same outer
  shell dimensions as the page so nothing jumps. Reduced motion is already handled globally in
  `globals.css` (`prefers-reduced-motion`).
- Empty:
  - No measurements: chart still shows the reference curves (when sex and birth date exist) with
    no dots; list area shows the tracker-style dashed card: "No measurements yet" / "Add the
    first weight, length or head size from the carnet de santé." with the Add button (admins). For
    viewers: only the first line.
  - No measurements for the selected indicator but others exist: a muted line under the chart "No
    weight measurement yet".
  - No vaccines given: "Already given" section omitted; if nothing is due either, show the "Coming
    up" list only.
- Error: `health/error.tsx` copied from `tracker/error.tsx` (page-level, with retry). Action
  failures: `toast.error(t('errors.codes.<key>'))`, the modal stays open and keeps the user's
  input; `notFound` closes the modal and refreshes (as in the tracker). Thrown or network
  errors: `errors.network` / `errors.save` / `errors.delete`. Inline field errors as listed.
- Success: sonner `toast.success` for save, delete and profile saved (short, one line). This is a
  small difference from the tracker, which closes silently: health writes are rare and the
  confirmation matters more than in a quick feed log.
- Offline / slow:
  - Reuse `useOnline`; move `tracker/_components/use_online.ts` to a shared location (for example
    `src/components/use_online.ts`) and import it from both pages, rather than importing across
    route folders.
  - Offline: all Add/Edit/Mark/Delete controls get `aria-disabled` and do nothing, and a
    one-line notice appears under the header: "You're offline. You can read the records but not
    change them." (`role="status"`, `text-sm text-muted-foreground`). The tracker silently
    ignores taps; here the notice explains why.
  - Slow save: Save shows the Loader2 spinner and "Saving…", Cancel/close are disabled
    (`dismissible={!saving}`), so a double tap cannot create two records (the unique dose index is
    a backstop).
  - The page itself is server-rendered; whether it loads offline depends on the existing service
    worker and is not changed here.
  - Switching the view or window needs no network (view switch is a link, but both views are
    already in the page payload; window and indicator are client state).

### Copy
All keys under `health.` unless noted. `{…}` are ICU placeholders. French strings use the
familiar "vous". Percentile display `P{value}` is the same in both languages.

| Key | English | French |
|-----|---------|--------|
| pages.health.name | Health | Santé |
| pages.health.eyebrow | Page — Health | Page — Santé |
| pages.health.description | Growth curves and vaccines. | Courbes de croissance et vaccins. |
| title | Health | Santé |
| subtitle | Growth and vaccinations, in one place. | Croissance et vaccins, au même endroit. |
| offline | You're offline. You can read the records but not change them. | Vous êtes hors connexion. Vous pouvez consulter les données mais pas les modifier. |
| views.label | Health sections | Rubriques santé |
| views.growth | Growth | Croissance |
| views.vaccines | Vaccines | Vaccins |
| views.overdueCount | {count, plural, one {# vaccine overdue} other {# vaccines overdue}} | {count, plural, one {# vaccin en retard} other {# vaccins en retard}} |
| profile.heading | Profile | Profil |
| profile.prompt | Add the birth date and sex to see growth curves and due vaccines. | Ajoutez la date de naissance et le sexe pour afficher les courbes et les vaccins à faire. |
| profile.summary | Born {date} · {age} | Né(e) le {date} · {age} |
| profile.birthDate | Birth date | Date de naissance |
| profile.sex | Sex | Sexe |
| profile.sexHint | Only used to pick the right WHO curve. | Sert uniquement à choisir la bonne courbe de l'OMS. |
| profile.female | Girl | Fille |
| profile.male | Boy | Garçon |
| profile.edit | Edit profile | Modifier le profil |
| profile.editTitle | Edit profile | Modifier le profil |
| profile.save | Save | Enregistrer |
| profile.saved | Profile saved | Profil enregistré |
| profile.missingBirthDate | Add the birth date to see the curves | Ajoutez la date de naissance pour voir les courbes |
| profile.missingBirthDateVaccines | Add the birth date to see which vaccines are due | Ajoutez la date de naissance pour voir les vaccins à faire |
| profile.missingSex | Choose girl or boy to show the WHO curves | Choisissez fille ou garçon pour afficher les courbes de l'OMS |
| profile.askAdmin | An administrator needs to add this. | Un administrateur doit renseigner cette information. |
| profile.setBirthDate | Set birth date | Renseigner la naissance |
| growth.heading | Growth | Croissance |
| growth.indicatorLabel | Measurement shown | Mesure affichée |
| growth.indicators.weight | Weight | Poids |
| growth.indicators.length | Length | Taille |
| growth.indicators.lengthHeight | Length / height | Taille |
| growth.indicators.head | Head | Tour de tête |
| growth.listHeading | Measurements | Mesures |
| growth.add | Add a measurement | Ajouter une mesure |
| growth.addTitle | Add a measurement | Ajouter une mesure |
| growth.editTitle | Edit measurement | Modifier la mesure |
| growth.editEntry | Edit measurement of {summary} | Modifier la mesure du {summary} |
| growth.date | Date | Date |
| growth.weight | Weight (kg) | Poids (kg) |
| growth.length | Length (cm) | Taille (cm) |
| growth.height | Height (cm) | Taille debout (cm) |
| growth.head | Head circumference (cm) | Tour de tête (cm) |
| growth.note | Note | Note |
| growth.notePlaceholder | E.g. check-up with Dr. Martin | Ex. visite chez le Dr Martin |
| growth.hintPercentile | About P{value} for {age} | Environ P{value} pour {age} |
| growth.hintUnusual | Unusual value, please double check | Valeur inhabituelle, vérifiez la saisie |
| growth.atLeastOne | Enter at least one measurement. | Saisissez au moins une mesure. |
| growth.save | Save | Enregistrer |
| growth.saving | Saving… | Enregistrement… |
| growth.cancel | Cancel | Annuler |
| growth.delete | Delete | Supprimer |
| growth.deleteConfirm | Delete the measurement of {date}? | Supprimer la mesure du {date} ? |
| growth.saved | Measurement saved | Mesure enregistrée |
| growth.deleted | Measurement deleted | Mesure supprimée |
| growth.empty | No measurements yet | Aucune mesure pour l'instant |
| growth.emptyHint | Add the first weight, length or head size from the carnet de santé. | Ajoutez le premier poids, la première taille ou le premier tour de tête du carnet de santé. |
| growth.emptyIndicator | No {indicator} measurement yet | Aucune mesure de {indicator} pour l'instant |
| growth.by | By {name} | Par {name} |
| growth.beforeBirth | Before the birth date | Avant la naissance |
| growth.outsideWindow | {count, plural, one {# measurement is outside this period} other {# measurements are outside this period}} | {count, plural, one {# mesure est hors de cette période} other {# mesures sont hors de cette période}} |
| growth.lengthHeightNote | At 24 months the curve steps: length lying down becomes height standing. | À 24 mois la courbe change : la taille couchée devient la taille debout. |
| growth.errors.weight | Weight must be between 0.3 and 40 kg. | Le poids doit être compris entre 0,3 et 40 kg. |
| growth.errors.length | Length must be between 20 and 140 cm. | La taille doit être comprise entre 20 et 140 cm. |
| growth.errors.head | Head circumference must be between 20 and 65 cm. | Le tour de tête doit être compris entre 20 et 65 cm. |
| growth.errors.invalidNumber | Enter a number, for example 6.2 | Saisissez un nombre, par exemple 6,2 |
| growth.errors.future | The date can't be in the future. | La date ne peut pas être dans le futur. |
| growth.errors.beforeBirth | The date can't be before the birth date. | La date ne peut pas être avant la naissance. |
| chart.label | {indicator} chart, {sex} WHO curves, {from} to {to} | Courbe de {indicator}, courbes OMS {sex}, de {from} à {to} |
| chart.summary | Latest: {value} at {age}, around P{percentile}. The shaded area is the range between P3 and P97. | Dernière mesure : {value} à {age}, environ P{percentile}. La zone grisée va de P3 à P97. |
| chart.summaryEmpty | No measurements plotted yet. The shaded area is the WHO range between P3 and P97. | Aucune mesure sur la courbe. La zone grisée correspond à l'intervalle OMS entre P3 et P97. |
| chart.windowLabel | Period shown | Période affichée |
| chart.window6m | 6 months | 6 mois |
| chart.window1y | 1 year | 1 an |
| chart.window2y | 2 years | 2 ans |
| chart.window5y | 5 years | 5 ans |
| chart.ageAxis | Age (months) | Âge (mois) |
| chart.pointLabel | {date}, {age}, {value}, P{percentile} | {date}, {age}, {value}, P{percentile} |
| chart.pointLabelNoPercentile | {date}, {age}, {value} | {date}, {age}, {value} |
| chart.median | Median for this age: {value} | Médiane pour cet âge : {value} |
| chart.legend | Shaded area: between P3 and P97, where 94% of babies are. | Zone grisée : entre P3 et P97, où se situent 94 % des bébés. |
| chart.disclaimer | For information only. Talk to your paediatrician about any concern. | À titre indicatif. Parlez-en à votre pédiatre en cas de doute. |
| chart.source | WHO Child Growth Standards | Normes de croissance de l'OMS |
| vaccines.heading | Vaccines | Vaccins |
| vaccines.add | Record a vaccine | Enregistrer un vaccin |
| vaccines.addTitle | Record a vaccine | Enregistrer un vaccin |
| vaccines.editTitle | Edit vaccine record | Modifier le vaccin |
| vaccines.editEntry | Edit {summary} | Modifier {summary} |
| vaccines.todo | To do | À faire |
| vaccines.upcoming | Coming up | À venir |
| vaccines.given | Already given | Déjà faits |
| vaccines.unscheduled | Other vaccines | Autres vaccins |
| vaccines.showAll | Show the full schedule | Voir tout le calendrier |
| vaccines.hideAll | Hide the full schedule | Masquer le calendrier |
| vaccines.markGiven | Mark as given | Marquer comme fait |
| vaccines.markGivenFor | Mark {vaccine}, dose {dose}, as given | Marquer {vaccine}, dose {dose}, comme fait |
| vaccines.doseLabel | Dose {dose} | Dose {dose} |
| vaccines.mandatory | Mandatory | Obligatoire |
| vaccines.recommended | Recommended | Recommandé |
| vaccines.optionalDose | Only with the 3-dose product | Uniquement avec le vaccin à 3 doses |
| vaccines.atAge | At {months, plural, one {# month} other {# months}} | À {months, plural, one {# mois} other {# mois}} |
| vaccines.window | From {from} to {to} | Du {from} au {to} |
| vaccines.windowOverdue | Was due before {to} | À faire avant le {to} |
| vaccines.windowSoon | From {from} | À partir du {from} |
| vaccines.givenOn | Given {date} | Fait le {date} |
| vaccines.by | By {name} | Par {name} |
| vaccines.status.given | Given | Fait |
| vaccines.status.overdue | Overdue | En retard |
| vaccines.status.due | Due now | À faire maintenant |
| vaccines.status.soon | Soon | Bientôt |
| vaccines.status.upcoming | Upcoming | À venir |
| vaccines.vaccine | Vaccine | Vaccin |
| vaccines.label | Vaccine name | Nom du vaccin |
| vaccines.dose | Dose | Dose |
| vaccines.doseHint | Next dose: {dose} | Prochaine dose : {dose} |
| vaccines.date | Date given | Date de la vaccination |
| vaccines.note | Note | Note |
| vaccines.notePlaceholder | E.g. mild fever the next day | Ex. petite fièvre le lendemain |
| vaccines.save | Save | Enregistrer |
| vaccines.saving | Saving… | Enregistrement… |
| vaccines.cancel | Cancel | Annuler |
| vaccines.delete | Delete | Supprimer |
| vaccines.deleteConfirm | Delete the record of {vaccine}, dose {dose}? | Supprimer l'enregistrement de {vaccine}, dose {dose} ? |
| vaccines.saved | Vaccine recorded | Vaccin enregistré |
| vaccines.deleted | Vaccine record deleted | Enregistrement supprimé |
| vaccines.empty | Nothing recorded yet | Rien d'enregistré pour l'instant |
| vaccines.scheduleSource | Source: French vaccination calendar 2025 | Source : calendrier vaccinal français 2025 |
| vaccines.disclaimer | Always check the carnet de santé and your doctor's advice. | Vérifiez toujours avec le carnet de santé et l'avis de votre médecin. |
| vaccines.names.<code> | (see the plan's Translations section) | (voir la section Translations du plan) |
| errors.codes.notFound | This record no longer exists. | Cet enregistrement n'existe plus. |
| errors.codes.invalidDate | Enter a valid date. | Saisissez une date valide. |
| errors.codes.future | The date can't be in the future. | La date ne peut pas être dans le futur. |
| errors.codes.beforeBirth | The date can't be before the birth date. | La date ne peut pas être avant la naissance. |
| errors.codes.noMeasurement | Enter at least one measurement. | Saisissez au moins une mesure. |
| errors.codes.invalidWeight | Weight must be between 0.3 and 40 kg. | Le poids doit être compris entre 0,3 et 40 kg. |
| errors.codes.invalidLength | Length must be between 20 and 140 cm. | La taille doit être comprise entre 20 et 140 cm. |
| errors.codes.invalidHead | Head circumference must be between 20 and 65 cm. | Le tour de tête doit être compris entre 20 et 65 cm. |
| errors.codes.invalidVaccine | Choose a vaccine from the list. | Choisissez un vaccin dans la liste. |
| errors.codes.labelRequired | Enter the vaccine name. | Saisissez le nom du vaccin. |
| errors.codes.invalidDose | The dose must be between 1 and 10. | La dose doit être comprise entre 1 et 10. |
| errors.codes.duplicateDose | This dose is already recorded. | Cette dose est déjà enregistrée. |
| errors.codes.noteTooLong | The note is too long (500 characters max). | La note est trop longue (500 caractères maximum). |
| errors.codes.missingBirthDate | The birth date is not set yet. | La date de naissance n'est pas encore renseignée. |
| errors.codes.missingSex | The sex is not set yet. | Le sexe n'est pas encore renseigné. |
| errors.network | No connection. Try again in a moment. | Pas de connexion. Réessayez dans un instant. |
| errors.save | Couldn't save. Please try again. | Enregistrement impossible. Réessayez. |
| errors.delete | Couldn't delete. Please try again. | Suppression impossible. Réessayez. |
| age.days | {count, plural, one {# day} other {# days}} | {count, plural, one {# jour} other {# jours}} |
| age.months | {count, plural, one {# month} other {# months}} | {count, plural, one {# mois} other {# mois}} |
| age.monthsDays | {months} and {days} | {months} et {days} |
| age.years | {count, plural, one {# year} other {# years}} | {count, plural, one {# an} other {# ans}} |
| age.yearsMonths | {years} and {months} | {years} et {months} |

Age format rule (one helper, used in the list, readout, profile card and hints): under 1 month →
days; 1 to 23 months → months and, when days remain and the age is under 6 months, days;
from 24 months → years and months. French sex labels in the profile summary use neutral wording
"Fille"/"Garçon"; the summary line avoids gendered past participles by using "Naissance le {date}"
if the team prefers (builder: use `profile.summary` = "Naissance le {date} · {age}" in French to
avoid "Né(e)").

### Accessibility
- Chart:
  - `<svg role="img" aria-labelledby="{id}-title {id}-desc">` with `<title>` = `chart.label` and
    `<desc>` = `chart.summary` (latest value, age, percentile and what the shaded area means). The
    decorative bands, curves, gridlines and tick text are `aria-hidden`.
  - Each plotted point is a focusable `role="button"` with `aria-label` from `chart.pointLabel`, so
    keyboard and screen-reader users can walk through every measurement, and the readout card is
    `aria-live="polite"`.
  - The measurement list directly below is the full text alternative: every value, age and
    percentile as real text. The page order puts the chart, the readout and then the list.
  - Selection is shown by a ring and the readout, not by colour only. Bands are neutral and never
    use red/green.
- Focus: visible ring everywhere (`focus-visible:ring-3 focus-visible:ring-ring/30`, as the
  tracker). Focus order: header, profile card, view switch, [indicator, window, chart points,
  Add, list rows] or [Record, slot actions, given rows]. Modals use the base `Modal`, so focus is
  trapped, Escape closes (unless saving), focus returns to the opener. After a delete, focus lands
  on the section heading (`tabIndex={-1}`), because the row is gone.
- Touch targets: all buttons, rows, `ChoiceGroup` options, date and number inputs are at least
  44px high (`h-11` / `h-12` / `min-h-16`); chart hit circles are 44px.
- Forms: every field has a visible `Label` (not placeholder-only); units are in the label text;
  errors use `role="alert"`, `aria-invalid`, `aria-describedby` as in `care_event_modal.tsx`; number
  inputs are `type="text" inputMode="decimal"`, so decimal commas work on French keyboards.
- Status: each vaccine status is icon + word, and the status badge text is part of the card's
  accessible name via normal reading order ("Hexavalent, dose 1, Overdue, ..."). The "Mark as
  given" buttons carry `aria-label` from `vaccines.markGivenFor` so several identical buttons are
  distinguishable.
- Contrast: all text uses `text-landing-foreground` / `text-muted-foreground` on
  `bg-landing-surface`; the SVG tick labels use `fill-muted-foreground`. The `destructive`
  badge is `text-destructive` on `bg-destructive/10`, which is the existing badge variant; the
  builder should check contrast in both themes.
- Motion: no entrance or draw animation; the selected-point ring transition is `motion-safe:`.
- Language: dates and numbers formatted with the active locale (`Intl`), decimals as `6,2` in
  French; the input accepts both separators.
- z-index: `Modal`/`Dialog` at `z-[60]` and the vaccine `Select` at `z-[70]` come from existing
  components; no new z-index is introduced. The chart has no floating tooltip, so none is needed.
  If one is ever added, it must be `z-[70]`.

### Questions
Decisions in this design that depend on the plan's open questions (not resolved here):
- Q1 (write permission): the design hides every add/edit/delete/mark control and makes rows
  non-interactive for non-admins. If the user picks the tracker model (page role governs writes),
  the condition becomes "has write access to the page" and nothing else changes.
- Q3 (sex for the curves): the sex field and the "Choose girl or boy" prompt assume a recorded
  sex. If the user prefers "pick a reference without recording a sex", rename the field to
  "Reference curves" (Girls / Boys) and the hint accordingly.
- Q4 (WHO vs French curves): the source line, legend and disclaimer say WHO. If French curves are
  later chosen, only the data module, the `chart.source` copy and the P-values change.
- Q5 (corrected age): all ages shown are chronological. If corrected age is added, the readout, the
  list and the add form need an extra "corrected age" line.
- Q6 (chart): this design says hand-rolled SVG is enough, because tap-to-select with a readout
  card replaces hover tooltips. If the user wants hover tooltips or zoom, recharts is needed and
  the chart section changes.
- Q7 (6-year booster / schedule): if the 6-year DTCaP slot is dropped, the "Coming up" list simply
  has fewer rows. The design groups by age, so it adapts.
- Q8 (product and lot): if added, the vaccine modal gets two optional text fields (product, lot)
  below Dose, and the given row shows them on a third line.

Design decisions for the user (not in the plan's list):
- "Mark as given" opens a prefilled modal (two taps) rather than recording instantly (one tap). The
  plan said one tap "would be natural". If you want true one-tap, record with today's date and show
  a toast with an "Undo" action that calls the delete action.
- Sex label: "Sex" or "Sex at birth"? The design uses "Sex" with the hint "Only used to pick the
  right WHO curve". Say if you want different wording.
- The "Unusual value, please double check" hint and the live percentile hint in the form go slightly
  beyond the plan's list. They are cheap, and they use only the planned pure functions; drop them if
  you want a stricter scope.
- Success toasts on save and delete (the tracker has none).

Flag for the planner:
- Moving `use_online.ts` out of `tracker/_components/` to a shared location is a small refactor
  that touches the tracker. Alternatively the builder duplicates the 15-line hook.
- Page needs the viewer/admin level passed to the client components. `assertPageAccess` should
  return the level (or the page should call the same helper the cores use) so the UI can hide write
  controls; this is only a UI affordance, the cores and RLS remain the enforcement.

### Planner notes (kept for reference)
Behavior and data the screens need, as written by the planner:
- **Profile prompt**: birth date and sex inputs (admins); shown inline when either is missing.
- **Growth**:
  - one chart per indicator (weight, length/height, head) showing the P3, P15, P50, P85 and P97
    curves with the baby's points joined chronologically;
  - an age window selector (6 m, 1 y, 2 y, 5 y);
  - a measurement list (date, age, the three values, percentile per value, note, who logged it);
  - an add/edit form with three optional numeric fields and a date. The date defaults to today.
- **Vaccines**: an upcoming list grouped or ordered by status (overdue, due, soon, upcoming),
  each slot showing the vaccine name, dose, "at N months", due dates, and whether it is mandatory
  or recommended. A given-shots list. An add/edit form (vaccine select, label for "other", dose,
  date, note). A one-tap "mark as given today" on a due slot would be natural.
- **Open layout questions**: tabs vs sections (a `?view=growth|vaccines` search param is
  available if tabs are chosen), mobile chart sizing, and whether rich hover tooltips are worth a
  chart dependency.
- **z-index**: modals use `z-[60]`; any popover, select or date picker inside them uses
  `z-[70]` (`docs/z-index.md`). The chart needs no z-index; if a tooltip is added, it is
  `z-[70]`.

## Risks and open questions
1. **Write permission**: this plan makes writes admin-only in both the app and RLS, even if
   the page is opened to viewers, who could then only read. The alternative is to match the
   tracker (member RLS, page role governs writes). Which one?
2. **Birth date and sex in `baby_health_profiles`, not `babies`**: the reason is that `babies`
   has no RLS and grants ALL to anon. OK? If yes, a later feature that needs the birth date reads
   it from here.
3. **Sex for the curves**: WHO curves exist only for girls and boys. The plan offers two values
   and shows no curves until one is set. Acceptable, or should the user be able to pick which
   reference to use without recording a sex?
4. **Curve reference**: the French carnet de santé (2018) uses the AFPA/Inserm French curves,
   not WHO, so pediatrician percentiles may differ slightly from the app's. Keep WHO as approved?
5. **Prematurity**: should corrected age be supported (it needs gestational age at birth)?
   Currently out of scope.
6. **Chart**: a hand-rolled SVG with no dependency is the recommendation. Switch to shadcn
   charts (recharts) only if the designer wants hover tooltips or zoom.
7. **Schedule accuracy**: the table comes from the 2025 French calendar and must be checked
   against the official 2026 edition before step 3 is committed. Include the 6-year DTCaP
   booster, or stop at 18 months?
8. **Extra fields on shots**: add product name and lot number (both are written in the carnet)
   now, or later?
9. **MCP**: there are no update tools and no tool to set birth date or sex. Add
   `set_health_profile`?
10. **Migration checkpoint**: step 1 applies the additive migration after a migration-only
    review, before the feature is reviewed, so types can be generated. This is the same as the
    tracker. Confirm.
11. **Data sensitivity**: health records sit in the same Supabase instance as everything else.
    There is no extra encryption, and backups follow the existing setup.

## How to verify
1. Run the migration checks with `mise exec -- pnpm supabase db query --db-url …`:
   - as `anon`, `SELECT` on all three tables fails (42501);
   - as a viewer member, `SELECT` works and `INSERT`/`UPDATE`/`DELETE` are denied;
   - as an admin, updating `baby_id` or `created_by` is denied (column grants);
   - `\dp` shows no table-wide UPDATE for `authenticated`.
2. As an admin, enable Health in admin → page settings. The page appears in the nav and on the
   landing page.
3. Without a profile: the measurement list works, the curves and vaccine status show prompts,
   and the schedule shows "at N months".
4. Set the birth date and sex, then add a weight-only, a length-only and a full measurement.
   - Values round-trip in kg and cm.
   - The percentiles look plausible: a 3.35 kg boy at birth ≈ P50.
   - Points sit on the curves; a future date or a date before birth is rejected with translated
     text.
5. Switch the chart window. The 24-month step on length/height is visible on the 2 y and 5 y
   windows.
6. With a birth date about 5 months ago:
   - hexa-1, pcv-1, menb-1 and the others not recorded show **overdue**;
   - record hexa-1 (dose prefilled 1), and it becomes **given**;
   - recording hexa dose 1 again → `duplicateDose`;
   - an `other` shot without a label is rejected; with a label it appears under unscheduled.
7. MCP (a personal token, then an OAuth client):
   - `list_babies` shows `health` once it is enabled;
   - `add_growth_measurement` with `weightKg: 6.2`, then `list_growth_measurements`, shows it
     with a percentile;
   - `add_vaccination` with `mmr`, then `list_upcoming_vaccines`, reflects it;
   - errors read as translated text.
8. **User without access**:
   - a viewer, while the page role is admin, is redirected from `/baby/<id>/health`, and MCP
     health tools return the unauthorized text;
   - with the page role set to viewer, the viewer can read but every write is refused (app and
     MCP);
   - a member of baby A calling any health tool or action with baby B's id, or with a
     measurement id from baby B, gets unauthorized or notFound.
9. Switch `DEFAULT_LOCALE=en`: all copy is translated and no French strings remain except the
   schedule source name.
