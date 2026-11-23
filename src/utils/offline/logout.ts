'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useConfirm } from '@/components/confirm_provider'
import { logout } from '@utils/actions/logout'
import { loadOfflineQueue } from '@utils/offline/queue-client'

// Logout for every call site: entries logged offline live only on this phone, so a logout that
// would delete them asks first, and the device's offline data (queue, last-known state) is
// cleared before the session ends. Shared with the future E2EE logout.
export function useLogout() {
  const confirmAction = useConfirm()
  const t = useTranslations('nav')

  return useCallback(async () => {
    let queue: Awaited<ReturnType<typeof loadOfflineQueue>> | null = null
    let count = 0
    try {
      queue = await loadOfflineQueue()
      count = await queue.pendingCount({ all: true })
    } catch {
      // No IndexedDB or script (private mode, blocked): there is nothing on the device to protect.
      queue = null
    }

    if (count > 0) {
      const confirmed = await confirmAction({
        title: t('logoutUnsyncedTitle'),
        description: t('logoutUnsynced', { count }),
        confirmLabel: t('logoutUnsyncedConfirm'),
      })
      if (!confirmed) return
    }

    try {
      await queue?.clearForLogout()
    } catch {
      // Logging out matters more than a failed cleanup.
    }
    await logout()
  }, [confirmAction, t])
}
