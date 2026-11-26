'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { localListDeletes } from './local_list_deletes'

// Renders nothing: the list page sent us here with `?gone=1` because the open list no
// longer exists (deleted on another device, or a stale link). Says so once, then strips
// the param. Sonner announces the toast, so focus stays where it is.
export default function GoneNotice({ babyId }: { babyId: string }) {
  const t = useTranslations('todo.lists')
  const router = useRouter()
  // Strict Mode runs effects twice; the second run must not see the cleared set.
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true
    if (localListDeletes.size > 0) localListDeletes.clear()
    else toast.info(t('gone'))
    router.replace(`/baby/${babyId}/todo`, { scroll: false })
  }, [babyId, router, t])

  return null
}
