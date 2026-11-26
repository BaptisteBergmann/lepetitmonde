---
tags: [lepetitmonde/architecture, security, database]
---

# Row Level Security

Up: [[Le petit monde]] · See also [[Authorization]], [[Data model]], [[Security model]]

Postgres RLS is the database-level backstop to the checks in [[Authorization]]. Its rollout is **partial**.

## Enabled today

RLS is on from creation for the tables added since October 2026:

| Tables | Notes |
|---|---|
| `care_events` | Members can read and write; column-level `UPDATE` grants stop moving a row to another baby. See [[Baby tracker]]. |
| `album_share_photos`, `album_share_accesses` | Read-only for admins; only the service role writes. See [[Share links]]. |
| `api_tokens` | See [[MCP server]]. |
| `oauth_clients`, `oauth_grants` | See [[OAuth authorization server]]. |
| `baby_health_profiles`, `growth_measurements`, `vaccinations` | See [[Health]]. |
| `todo_lists` | Admin-only: `is_baby_admin(baby_id)` on select, insert, update, delete. See [[To-do list]]. |

New tables must enable RLS **and** revoke the default `anon` grants explicitly (the baseline's default privileges grant `anon` on new tables).

## Circle helpers

`is_circle_visible(baby, circle_ids)` includes sub-circles through `circle_descendants_or_self(uuid[])` (recursive CTE, depth guard 10), so a future circle policy matches the app rule ([[Circles]]). The helper and the three trigger functions (`circles_check_hierarchy`, `circles_reparent_children`, `circles_access_check_tree`) are `SECURITY DEFINER` with a pinned `search_path`, owned by `postgres`, with `EXECUTE` revoked from `anon` and `authenticated` (granted to `service_role` only). `is_circle_visible` keeps its grants and calls the helper through its definer rights.

## Not yet

The older tables (posts, stories, comments, events, circles, guesses, inventory, invitations...) are protected only by application code. The plan to cover them in batches is `.claude/plans/rls.md` (on hold since 2026-10-23). Until then, keep in mind:

- The service-role key bypasses RLS and is used for Storage, the [[Realtime]] relay, signup, share links and the [[MCP server]]. It never reaches the browser.
- No browser-side Supabase client exists, so the publishable key is never exposed in the bundle either.
- Every action must keep doing its own checks (`feed-access.ts`, `assertIsAdmin`, the cores).
