const THUMBNAIL_MAX_DIMENSION = 480

// Downscales an image file to a small JPEG thumbnail entirely in the
// browser, mirroring video-thumbnail.ts's canvas approach, so photo grids
// can load a lightweight thumbnail instead of the full-size original.
// Returns null (not an error) for anything the browser can't decode
// client-side (e.g. HEIC in browsers without native HEIC support) — callers
// fall back to the full-size url, same as when a video has no poster frame.
export async function generateImageThumbnail(file: File | Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    const cleanup = () => URL.revokeObjectURL(url)
    const finish = (blob: Blob | null) => {
      cleanup()
      resolve(blob)
    }

    img.onload = () => {
      const scale = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)

      const ctx = canvas.getContext('2d')
      if (!ctx || canvas.width === 0 || canvas.height === 0) {
        finish(null)
        return
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.8)
    }
    img.onerror = () => finish(null)
    img.src = url
  })
}
