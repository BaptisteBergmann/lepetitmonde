# Fix concurrent-user host overload (feed page)

## Context

Multiple family members opened the app at the same time and the host (a 4 vCPU / 6 GiB LXC running the whole Docker stack) spiked to ~100% CPU, memory climbed to fill the entire container, and disk reads jumped to several GB in the same ~15–30 min window. This needs to not happen again as more family members use the app simultaneously (e.g. around a birth/visit, exactly when load is highest).

Code investigation found **two independent, stacking root causes** in the feed page (`/baby/[babyId]/feed`), plus supporting hardening. They compound: every concurrent viewer multiplies both problems at once.

## Root cause A (dominant — matches the memory/diskread graphs directly): the media proxy buffers whole files in memory

`src/app/api/storage/[babyId]/[...path]/route.ts` serves every photo and video shown in the feed (`PostWithDetails.photos[].url` / `.thumbnailUrl` both point here). For **every single image/video request, from every viewer**:

1. `getAuthUser()` — network round-trip to GoTrue to verify the JWT
2. `getUserAccess(babyId)` — a DB query
3. `supabaseAdmin.storage.from(babyId).download(objectPath)` — the Supabase JS SDK's `.download()` always does `fetch().blob()` internally, i.e. **the entire file is pulled into Node process memory** before being served, for both branches:
   - Non-range requests: buffered into a Blob, then re-streamed via `data.stream()`.
   - Range requests (**used by every `<video>` element** — browsers issue Range requests even for `preload="metadata"`): the code explicitly does `Buffer.from(await data.arrayBuffer())`, i.e. downloads the **entire video** just to slice out a few KB.

With several viewers scrolling a feed full of photos and videos at once, this means multiple full media files (potentially many MB each for video) sitting fully buffered in Node memory simultaneously, with zero caching (`Cache-Control: private` correctly prevents shared/CDN caching since access is per-user, but that also means every viewer re-triggers a fresh full download). This lines up precisely with the observed graphs: disk reads in the multi-GB range (Supabase Storage reading files to serve the downloads) and memory climbing steadily until it fills the container.

**Fix**: stop using the SDK's buffering `.download()`. Proxy the request as a true stream instead:
- Fetch directly from the Storage REST endpoint (`${SUPABASE_URL}/storage/v1/object/{bucket}/{path}`) with the service-role `Authorization` header, **forwarding the incoming `Range` header** if present.
- Return `new Response(upstreamResponse.body, { status: upstreamResponse.status, headers: forwardedHeaders })` — pipes bytes straight through without ever materializing the full file in the app's memory. Supabase's storage-api forwards Range requests to the underlying object storage, so range/seek support for video should keep working without the manual `Buffer.subarray` slicing logic.
- Keep the existing `getAuthUser()` / `getUserAccess()` authorization check in front — that part is correct and must stay.

This is a single-file, self-contained fix and should be done first — it directly addresses what the graphs show.

## Root cause B (secondary — explains the CPU/request-volume side): every post independently re-fetches its own data on mount

`feed_view.tsx` renders one `PostCard` per post. Each `PostCard` fires **4 separate Server Actions in `useEffect` on mount**: `getComments`, `getReactions`, `getPollWithResults`, `getPostViews` (+ `markPostViewed`) — none of this is fetched once and passed down, unlike `circles` which the feed already fetches once and passes as a prop.

Each of those 4 actions independently repeats the same auth/lookup work:
- `getAuthUser()` → GoTrue round-trip
- `getUserAccess(babyId)` and/or `getNicknamesByBaby(babyId)` → extra DB queries, identical across all 4 calls but not shared (React's `cache()` on `getAuthUser`/`getUserAccess` only dedupes within one request — these are 4 *separate* Server Action HTTP invocations, so it does nothing here)
- the actual data query

For a feed of N posts that's roughly N × 4 × (1 auth check + 2–3 DB queries) requests on every load, multiplied again by however many people opened the feed at once.

**Fix**: batch these reads server-side and pass them down as props, the same pattern already used for `circles`:
- In the feed's data-loading path (`getPosts` in `src/utils/actions/posts.ts`, called from the feed page/`feed_view.tsx`), fetch comments/reactions/poll-results/views for **all** loaded posts in one or a few `IN (post_ids)` queries instead of per-post.
- Pass the batched results into `PostCard` as props; drop the individual `useEffect` fetches in `comment_list`/`reaction_picker`/`poll_voter`/`post_views`' parent (`post_card.tsx`).
- Keep the *mutation* actions (`addComment`, `addReaction`, `votePoll`, `markPostViewed`) as-is — only the initial-read fan-out changes. `markPostViewed` (a write, fired per post on mount) can stay per-post but should no longer also re-fetch full view data — pass the initial view list down as a prop and only re-fetch on the realtime-driven update path that `post_views.tsx` already has.

## Root cause C (a real caching layer, not just dedup — biggest lever for repeat load): nothing is cached across requests or across users

Today every read — `getComments`, `getReactions`, `getPollWithResults`, `getPostViews`, `getNicknamesByBaby`, `getUserAccess`, `getAuthUser` — hits Postgres/GoTrue fresh, for every request, from every user, every time. `cache()` from React only dedupes within a single render, so it buys nothing across the many separate requests one page load generates, and nothing at all across different viewers looking at the same baby's feed simultaneously — which is exactly the "multiple users joined at once" scenario. Three independent caching layers apply here and stack with A and B:

- **Server-side data cache for reads.** Wrap the shared lookups in `unstable_cache` from `next/cache` (no experimental flags needed on this Next version — the newer `"use cache"` directive would need `experimental.cacheComponents` enabled in `next.config.ts`, which isn't on, so `unstable_cache` is the zero-config path): `getNicknamesByBaby`, `getUserAccess`, and the batched comments/reactions/poll/views reads from fix B, each tagged e.g. `baby-${babyId}` / `post-${postId}`. The first request per baby/post populates the cache; every other concurrent viewer of the *same* feed then reads from cache instead of hitting Postgres — this is what actually neutralizes "N users load the same feed at once," beyond just batching each user's own N requests. Invalidate with `revalidateTag(...)` alongside the existing `revalidatePath(...)` calls already present in every mutation (`addComment`, `addReaction`, `votePoll`, `markPostViewed`, `updateUserAccessLevel`, nickname edits, etc.) — those call sites are already known from root cause B's investigation, so wiring in the matching tag is a small addition at each one.
- **Short-TTL auth verification cache.** `getAuthUser()`'s GoTrue round-trip is a security check, so it shouldn't be cached for long, but a few-seconds in-process TTL cache keyed by the access token absorbs a page-load burst (dozens of calls firing within milliseconds of each other) without meaningfully weakening "never trust the client" — the token still gets re-verified every few seconds, just not dozens of times in the same instant.
- **Stronger HTTP caching on the media proxy (fix A).** Post photos/videos are immutable once uploaded (no in-place edit), so the streaming route can safely respond with a long `max-age` plus `immutable` instead of the current `max-age=3600` — repeat views (scrolling back up, reopening the lightbox, revisiting the feed) are then served entirely from the browser's own cache with zero server/storage hit. This doesn't help the *first* concurrent load of a burst, but it means the second, third, etc. view of the same media by the same person costs nothing.

## Stacking hardening (do after A + B + C, lower urgency)

4. **HEIC upload buffering** (`src/app/api/upload/route.ts`) — same "buffer whole media file in Node memory" anti-pattern as root cause A, already flagged in that file's own comment as a known OOM vector for large uploads. Lower priority since uploads are admin-only and less likely to be concurrent, but worth converting `heic-convert`'s buffer-based flow to a bounded/streamed approach (or at minimum capping upload size) the same week.
5. **Container resource limits** — the Portainer compose file (`docker-compose.portainer.yml`) sets no `mem_limit`/`cpus`, so a request spike inside the app can consume the entire host's RAM and starve everything else in the stack (Postgres, GoTrue, etc. — worsening the incident rather than isolating it). Add a memory limit (with a matching Node `--max-old-space-size`) so the Next.js container OOM-kills and restarts under pathological load instead of swap-thrashing the whole LXC. Also worth bumping the LXC's tiny 512 MiB swap, which was already 99.99% full during the incident.

## Suggested order

1. Root cause A (storage proxy streaming fix) — biggest, most direct match to the incident graphs, single file.
2. Root cause B (batch per-post fetches) — larger diff (feed action + 4 child components), addresses the request-volume/CPU side.
3. Root cause C (caching layers) — naturally layers on top of B (tag the now-batched queries) and A (HTTP cache headers); the short-TTL auth cache can land independently at any point.
4. Hardening items 4–5 — can land incrementally afterward.

## Verification

- After fix A: load the feed with several photo/video posts, confirm images and videos still render, and specifically confirm **video seeking still works** (drag the scrubber) since that depends on Range-request forwarding still functioning correctly. Watch container memory in `docker stats` (or the Proxmox graphs) while scrolling a media-heavy feed — it should stay flat instead of climbing.
- After fix B: load a feed with multiple posts that have comments/reactions/polls/views, confirm all still display correctly and mutations (adding a comment/reaction/vote) still work and still update the UI. Check the Network tab — should see one batched load instead of 4×N requests.
- After fix C: edit something (add a comment/reaction/nickname) and confirm the change shows up promptly for other viewers/tabs (i.e. `revalidateTag` is actually wired to every mutation that touches cached data — a missed tag means stale data lingering instead of a crash, so check this deliberately rather than relying on errors to surface it). Then reload the same feed from a second session and confirm via logs/`docker stats` that the second load doesn't re-hit Postgres for the same baby/post data.
- Simulate the original incident: open the feed from several browser sessions/devices at once against a feed with a handful of photo/video posts, watch host CPU/memory stay bounded this time.
