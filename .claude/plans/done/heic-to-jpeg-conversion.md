# V1: Convert HEIC/HEIF photo uploads to JPEG

## Status: implemented

Shipped: `heic-convert` + `@types/heic-convert` added, `src/app/api/upload/route.ts`
detects HEIC/HEIF by content-type or extension and converts to JPEG before upload.

## Context

When someone posts a photo taken on an iPhone, it's often saved as HEIC/HEIF, a format many browsers (Chrome, Firefox, etc.) can't render natively. The feed currently renders every attachment as a plain `<img src={photo.url}>` (`post_card.tsx:99-109`), so a HEIC photo just shows as a broken image for anyone not on Safari.

Goal for this V1: whenever a photo is uploaded, if it's HEIC/HEIF, transparently convert it to JPEG before it lands in storage, so every viewer's browser can render it. Video conversion is explicitly out of scope for V1 (per user decision) — video uploads pass through unchanged, as they do today.

Because the app already stores JPEG/PNG/WebP/GIF fine, and because we're only ever producing JPEG output (still a normal `<img>`-renderable type), **no database schema change and no feed-display change are needed** — this is scoped entirely to the upload path.

## Current upload path (for reference)

- `src/components/dropzone.tsx` + `use-supabase-upload.ts` → client picks files, `onUpload()` POSTs each file individually to `/api/upload?bucket=<babyId>&path=posts/<postId>/<file.name>` with `Content-Type` set from the browser's `file.type`.
- `src/app/api/upload/route.ts` → streams `request.body` straight into `supabaseAdmin.storage.from(bucket).upload(path, request.body, { contentType, cacheControl, upsert })` (kept as a streaming passthrough specifically so 500MB videos don't get buffered into memory).
- `src/app/baby/[babyId]/feed/_components/create_post_modal.tsx:61` → after `upload.onUpload()`, calls `attachPostPhotos(postId, babyId, upload.files.map(f => f.name))`, which inserts `post_photos` rows with `storage_path: posts/<postId>/<filename>`. Note: today this uses the *original* filenames — since we'll rename `.heic`/`.heif` to `.jpg` server-side, the client needs to learn the real final filename per file.

## Changes

### 1. `src/app/api/upload/route.ts` — convert HEIC/HEIF before upload

- Detect HEIC/HEIF by content-type (`image/heic`, `image/heif`) **or** by file extension on `path` (some browsers send a generic/empty `Content-Type` for HEIC) — check both, since neither alone is reliable.
- If detected:
  - Buffer the request body (`Buffer.from(await request.arrayBuffer())`) — safe here because this only applies to photos, not the 500MB video case that motivated streaming.
  - Convert to JPEG with `heic-convert` (pure JS/WASM via `libheif-js`, no native binary/Docker changes needed — unlike `sharp`, which would need libheif compiled in, or `ffmpeg`, which isn't in the Alpine runtime image).
  - Swap the object key's extension to `.jpg` and upload the resulting buffer with `contentType: 'image/jpeg'`.
  - Wrap the conversion in a try/catch → on failure, return the existing 400 error shape so the client's existing per-file error UI (`dropzone.tsx`) surfaces it, same as any other upload failure.
- Everything else (non-HEIC images, videos) keeps the current streaming passthrough untouched.
- Return the **final filename** (last path segment, post-rename) in the JSON response alongside `error`, so the client knows what actually got stored.

### 2. `src/utils/actions/use-supabase-upload.ts` — track renamed filenames

- `uploadFile()` reads `filename` from the JSON response too, defaulting to the original `file.name` if absent (keeps non-renamed uploads unaffected).
- Add a `finalNames: Record<string, string>` state (original name → final stored name), populated in `onUpload()` alongside the existing `successes` bookkeeping. `successes` itself stays keyed by *original* names — untouched — so the existing `dropzone.tsx` "is this file done" checks keep working with zero changes there.
- Expose `finalNames` in the hook's return value.

### 3. `src/app/baby/[babyId]/feed/_components/create_post_modal.tsx` — use final filenames

- `handleConfirm` currently does `attachPostPhotos(postId, babyId, upload.files.map(f => f.name))`, which (pre-existing bug) attaches every selected file including ones that failed to upload. Since we're already touching this line to resolve renamed filenames, fix it in the same change: filter to `upload.files` that are present in `upload.successes`, then map through `upload.finalNames[f.name] ?? f.name`. This is a small, directly-related fix, not a separate cleanup pass.

### 4. New dependency

- Add `heic-convert` to `package.json` (`pnpm add heic-convert`). If no official TS types ship with it / on DefinitelyTyped, add a minimal local declaration at `src/types/heic-convert.d.ts` covering the `convert({ buffer, format, quality })` signature we use, to satisfy strict TypeScript.

## Out of scope (confirmed with user)

- Video transcoding (HEVC/`.mov` → H.264/AAC MP4) — deferred to a future iteration.
- Any `post_photos` schema change / feed `<video>` rendering — not needed since this V1 never changes what a "photo" renders as (always ends up as a normal image type).

## Verification

- `pnpm build` / `tsc` — confirm strict typecheck passes with the new dependency and type declaration.
- Manually test via the running app (`mise run dev` or equivalent):
  1. Upload a `.heic` file (e.g. exported from Photos on Mac, or an iPhone-shot photo) through the "Nouvelle publication" modal → confirm it appears correctly in the feed as a normal photo (i.e. was actually converted, not just passed through).
  2. Upload a regular `.jpg`/`.png` → confirm unchanged behavior (still uploads and renders fine, path/filename unchanged).
  3. Upload a small video file → confirm it still uploads untouched (passthrough not broken by the new branch).
  4. Try an intentionally corrupt/truncated `.heic` file → confirm it surfaces as a per-file upload error in the modal rather than crashing the request.
