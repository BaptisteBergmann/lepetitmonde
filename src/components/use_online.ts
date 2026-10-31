import { useSyncExternalStore } from 'react'

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

// Server snapshot is `true` so SSR and hydration agree; the real value lands after mount.
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
