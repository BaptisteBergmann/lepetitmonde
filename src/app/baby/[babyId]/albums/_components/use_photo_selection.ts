'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { SHARE_LIMITS } from '@utils/album-limits'

// Select mode for the photo grids: tapping tiles toggles them instead of
// opening the lightbox, capped at what one share link can hold.
export function usePhotoSelection() {
  const t = useTranslations('albums.share')
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const cancel = useCallback(() => {
    setSelecting(false)
    setSelectedIds(new Set())
  }, [])

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size >= SHARE_LIMITS.photosPerShare) {
        toast.error(t('tooManyPhotos', { max: SHARE_LIMITS.photosPerShare }))
      } else {
        next.add(id)
      }
      return next
    })
  }, [t])

  // Esc leaves select mode, unless a dialog is open (Esc belongs to it then).
  useEffect(() => {
    if (!selecting) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) cancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selecting, cancel])

  return { selecting, selectedIds, start: () => setSelecting(true), cancel, toggle }
}
