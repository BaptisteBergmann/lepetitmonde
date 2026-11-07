---
tags: [lepetitmonde/guide, database]
---

# Database migrations

Up: [[Le petit monde]] · See also [[Data model]], [[Row Level Security]]

Schema changes are hand-written SQL files in `supabase/migrations/`, applied with the Supabase CLI.

1. `mise run db_migration_new <name>`: creates an empty timestamped file.
2. Write the SQL by hand.
3. `mise run db_push`: applies pending migrations. If it fails with `tls error (server refused TLS connection)`, run it through `mise exec` with `--debug`:
   ```sh
   mise exec -- bash -c 'pnpm supabase db push --debug --db-url "postgres://postgres.${POOLER_TENANT_ID}:${POSTGRES_PASSWORD}@${SUPABASE_DB_HOST}:${POSTGRES_PORT}/postgres?sslmode=disable"'
   ```
   Filter the `PG Send`/`PG Recv` lines and check the output for credentials before sharing it.
4. `mise run update_types`: regenerates `src/utils/supabase/database.types.ts`. Commit it with the migration.
5. `mise run db_migration_status`: shows applied vs. local migrations.

## Rules

- **Additive first.** `:latest` and `:prod` share one database ([[Build and deploy]]), so a migration must not break the code still running on `:prod`. New columns are nullable or defaulted; `NOT NULL` tightening and drops come in a later migration, once `:prod` runs the new code.
- **New tables get RLS from birth** and an explicit `REVOKE` of the default `anon` grants. Prefer column-level `UPDATE` grants when a row must not change baby or author.
- **Race-prone writes go in SQL**: atomic conditional updates, unique partial indexes.
- Never edit a migration that has been applied; add a new one.
