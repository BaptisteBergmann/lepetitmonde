import webpush from 'web-push'

// Configured lazily, on first actual use, not at module scope: Next.js
// evaluates server-action modules while collecting page data at build
// time, and VAPID_PRIVATE_KEY is a server secret intentionally not passed
// as a Docker build-arg, so it's unset at build time. A module-level call
// here crashed the Docker build (same class of bug as the module-load
// Resend construction fixed in 1876e85).
let vapidConfigured = false
export function ensureVapidConfigured() {
  if (vapidConfigured) return
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL!}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  vapidConfigured = true
}

export default webpush
