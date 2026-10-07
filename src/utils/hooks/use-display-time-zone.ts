'use client'

import { useSyncExternalStore } from 'react'
import { FAMILY_TIME_ZONE } from '@utils/formatting'

// The browser's time zone never changes while the page is open, so there is
// nothing to subscribe to.
const subscribe = () => () => {}
const getBrowserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// SSR and hydration use the server snapshot (the family's zone), so server
// and client markup always agree; React then re-renders with the browser's
// zone, so someone abroad still sees their local time.
export function useDisplayTimeZone(): string {
  return useSyncExternalStore(subscribe, getBrowserTimeZone, () => FAMILY_TIME_ZONE)
}
