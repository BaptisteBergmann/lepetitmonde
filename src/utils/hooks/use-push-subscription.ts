'use client'

import { useCallback, useEffect, useState } from 'react'
import { getVapidPublicKey, subscribeUser, unsubscribeUser } from '@utils/actions/notifications'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function deviceLabel() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Navigateur'
  const os = /iPhone|iPad/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux'
    : ''
  return os ? `${browser} · ${os}` : browser
}

// Shared by the header notification bell and the settings page card so the
// two entry points can't drift on subscribe/unsubscribe behavior.
export function usePushSubscription() {
  const [isSupported, setIsSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator && 'PushManager' in window)) return
    // navigator/window don't exist during SSR, so this one-time support check
    // can't move to render — it has to run after mount, client-only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSupported(true)

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => registration.pushManager.getSubscription())
      .then(setSubscription)
  }, [])

  const subscribe = useCallback(async () => {
    setIsPending(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const vapidPublicKey = await getVapidPublicKey()
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
      setSubscription(sub)
      const serializedSub = JSON.parse(JSON.stringify(sub))
      await subscribeUser(serializedSub, deviceLabel())
    } finally {
      setIsPending(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    if (!subscription) return
    setIsPending(true)
    try {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      setSubscription(null)
      await unsubscribeUser(endpoint)
    } finally {
      setIsPending(false)
    }
  }, [subscription])

  return { isSupported, subscription, isPending, subscribe, unsubscribe }
}
