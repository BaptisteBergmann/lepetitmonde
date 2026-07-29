'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { trackPathnameChange } from '@/utils/pwa-navigation'

export function PwaHistoryTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()

  useEffect(() => {
    trackPathnameChange(search ? `${pathname}?${search}` : pathname)
  }, [pathname, search])

  return null
}
