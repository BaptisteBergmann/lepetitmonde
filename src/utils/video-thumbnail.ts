// Captures a frame from a video file as a JPEG blob, entirely in the browser,
// so we have a poster image to show instead of a black box / broken icon in
// browsers that don't paint a frame for `preload="metadata"` videos.
export async function captureVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'

    const url = URL.createObjectURL(file)
    video.src = url

    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.remove()
    }

    const finish = (blob: Blob | null) => {
      cleanup()
      resolve(blob)
    }

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.1, video.duration / 2)
    }

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx || canvas.width === 0 || canvas.height === 0) {
        finish(null)
        return
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.8)
    }

    video.onerror = () => finish(null)
  })
}
