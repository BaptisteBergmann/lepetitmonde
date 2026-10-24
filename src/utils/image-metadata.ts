// Strips EXIF/XMP/IPTC (GPS, camera model, timestamps) from images by
// re-encoding with sharp. Used on upload and, until existing originals are
// backfilled, on the public share route.
//
// Not withMetadata(): rotate() bakes the EXIF orientation into the pixels so
// photos stay upright without the tag, and keepIccProfile() preserves
// wide-gamut colours while dropping everything else.
import 'server-only'
import sharp from 'sharp'

// Shared with the upload route's buffering cap (add_photos_modal.tsx /
// create_album_modal.tsx allow 50MB client-side).
export const MAX_IMAGE_UPLOAD_BYTES = 50 * 1024 * 1024

// Bounds the decode memory of a pixel-bomb image (a tiny PNG that expands to
// gigabytes).
export const SHARP_INPUT_OPTIONS = { limitInputPixels: 100_000_000 } as const

export class UnsupportedImageError extends Error {}

export async function stripImageMetadata(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  const meta = await sharp(buffer, SHARP_INPUT_OPTIONS).metadata()

  switch (meta.format) {
    case 'jpeg':
      return {
        buffer: await sharp(buffer, SHARP_INPUT_OPTIONS).rotate().keepIccProfile().jpeg({ quality: 90 }).toBuffer(),
        contentType: 'image/jpeg',
      }
    case 'png':
      return {
        buffer: await sharp(buffer, SHARP_INPUT_OPTIONS).rotate().keepIccProfile().png().toBuffer(),
        contentType: 'image/png',
      }
    case 'webp':
      if ((meta.pages ?? 1) > 1) {
        // Animated: rotate() would flatten the frames.
        return {
          buffer: await sharp(buffer, { ...SHARP_INPUT_OPTIONS, animated: true }).webp({ quality: 90 }).toBuffer(),
          contentType: 'image/webp',
        }
      }
      return {
        buffer: await sharp(buffer, SHARP_INPUT_OPTIONS).rotate().keepIccProfile().webp({ quality: 90 }).toBuffer(),
        contentType: 'image/webp',
      }
    case 'gif':
      // No EXIF block in GIF, and re-encoding animated GIFs is lossy.
      return { buffer, contentType: 'image/gif' }
    default:
      throw new UnsupportedImageError(`Unsupported image format: ${meta.format}`)
  }
}

// Process-wide cap on concurrent full-size re-encodes: each holds the decoded
// image in memory, so unbounded parallelism on a public route is a DoS path.
const MAX_CONCURRENT_STRIPS = 2
let activeStrips = 0
const waiters: Array<() => void> = []

function makeRelease() {
  let released = false
  return () => {
    if (released) return
    released = true
    const next = waiters.shift()
    if (next) next() // hands the slot straight to the next waiter
    else activeStrips--
  }
}

// Non-blocking: null when no slot is free.
export function tryAcquireStripSlot(): (() => void) | null {
  if (activeStrips >= MAX_CONCURRENT_STRIPS) return null
  activeStrips++
  return makeRelease()
}

export function acquireStripSlot(): Promise<() => void> {
  const release = tryAcquireStripSlot()
  if (release) return Promise.resolve(release)
  return new Promise((resolve) => {
    waiters.push(() => resolve(makeRelease()))
  })
}

export const STRIP_QUEUE_MAX_WAITERS = 8

// Bounded wait for a slot: null when the queue is already full or the wait
// exceeds timeoutMs, so a burst queues briefly instead of failing fast but
// can't pile up unbounded work on a public route.
export function acquireStripSlotWithTimeout(timeoutMs: number): Promise<(() => void) | null> {
  const release = tryAcquireStripSlot()
  if (release) return Promise.resolve(release)
  if (waiters.length >= STRIP_QUEUE_MAX_WAITERS) return Promise.resolve(null)
  return new Promise((resolve) => {
    const waiter = () => {
      clearTimeout(timer)
      resolve(makeRelease())
    }
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter)
      if (index !== -1) waiters.splice(index, 1)
      resolve(null)
    }, timeoutMs)
    waiters.push(waiter)
  })
}
