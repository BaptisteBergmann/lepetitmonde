// Explicit allowlist rather than an `image/*` / `video/*` prefix check: a prefix
// check would also accept `image/svg+xml`, which the storage GET route serves
// back with a matching Content-Type — an SVG can carry inline `<script>`.
export const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

export const ALLOWED_VIDEO_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
])
