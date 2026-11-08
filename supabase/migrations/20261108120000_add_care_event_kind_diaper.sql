-- Diaper changes: new care_events kind. See .claude/plans/diaper-changes.md.
-- Own migration file: a new enum value can't be used in the transaction that adds it.
-- Irreversible (an enum value can't be cleanly removed).
ALTER TYPE "public"."care_event_kind" ADD VALUE 'diaper';
