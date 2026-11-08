---
tags: [lepetitmonde/architecture, ai]
---

# MCP server

Up: [[Le petit monde]] · See also [[OAuth authorization server]], [[Core modules]]

`/api/mcp` is a remote **Model Context Protocol** server (Streamable HTTP, stateless, built on `mcp-handler`). It lets an AI assistant (Claude Code, Claude.ai, the Claude mobile app, Gemini CLI...) read and write a baby's data with the same permissions the user has in the web app.

## Authentication

`resolveBearer()` (`src/utils/mcp-auth.ts`) reads only the `Authorization: Bearer` header and dispatches on the prefix:

| Prefix | Kind | Created in |
|---|---|---|
| `lpm_` | Personal API token (`api_tokens`) | Settings > Connected apps (admins, max 10 active, optional 30/90-day expiry) |
| `lpma_` | OAuth access token (`oauth_grants`) | The OAuth flow, see [[OAuth authorization server]] |

Both resolve to `{ tokenId, userId }`. Tokens are stored as sha256 only and shown once. A database trigger revokes all of a user's tokens and grants when they stop being an admin of any baby. Failed auth and call volume are rate-limited (`mcp-limiters.ts`).

## Tools

Registered from `src/app/api/mcp/tools/` (one file per area, `index.ts` wires them):

| File | Tools | Feature |
|---|---|---|
| `babies.ts` | `list_babies` (with `accessLevel` and usable `areas`) | — |
| `todo.ts` | `list_todos`, `add_todo`, `set_todo_done`, `delete_todo`, `move_todo` | [[To-do list]] |
| `tracker.ts` | `get_tracker_status`, `list_tracker_entries`, `add_tracker_entry`, `start_tracker_timer`, `stop_tracker_timer`, `delete_tracker_entry` | [[Baby tracker]] (`add_tracker_entry` also logs diapers: `pee`, `poop`, `poopColor`, `poopTexture`) |
| `buy_list.ts` | `list_buy_list`, `mark_bought`, `add_buy_list_item`, `remove_from_buy_list` | [[Buy list]] |
| `inventory.ts` | `list_inventory`, `update_inventory_quantities` | [[Inventory]] |
| `calendar.ts` | `list_events`, `list_circles`, `add_event` | [[Calendar]] |
| `anecdotes.ts` | `list_anecdotes`, `add_anecdote` | [[Anecdotes]] |
| `health.ts` | `get_health_summary`, `set_health_profile`, growth and vaccination tools, `list_upcoming_vaccines` | [[Health]] |
| `digest.ts` | `get_digest` (day/week summary across areas) | — |

## How a call is checked

1. The route resolves the bearer token to a user id (service-role lookup).
2. The tool calls a [[Core modules|core function]] with the service-role client and that user id.
3. The core re-checks membership, role and [[Page settings]] on **every** call. A disabled page blocks its tools; a viewer gets what a viewer gets in the web app.

Writes that notify in the web app (a `life_stage` event, a new anecdote) notify from MCP too.

Client setup instructions are in the repo `README.md` ("Connect an MCP client").
