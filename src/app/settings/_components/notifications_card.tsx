'use client'

import { useEffect, useState } from 'react'
import { subscribeUser, unsubscribeUser, sendNotification } from '@utils/actions/notifications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, BellOff, Send } from 'lucide-react'

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

export default function NotificationsCard() {
  const [isSupported, setIsSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [message, setMessage] = useState('')
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator && 'PushManager' in window)) return
    setIsSupported(true)

    async function registerServiceWorker() {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      const sub = await registration.pushManager.getSubscription()
      setSubscription(sub)
    }

    registerServiceWorker()
  }, [])

  async function subscribeToPush() {
    setIsPending(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      })
      setSubscription(sub)
      const serializedSub = JSON.parse(JSON.stringify(sub))
      await subscribeUser(serializedSub, deviceLabel())
    } finally {
      setIsPending(false)
    }
  }

  async function unsubscribeFromPush() {
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
  }

  async function sendTestNotification() {
    if (!subscription || !message) return
    setIsPending(true)
    try {
      await sendNotification(message)
      setMessage('')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <Bell className="h-4.5 w-4.5 text-primary" />
          Notifications
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          Recevez une alerte sur cet appareil pour les évènements importants.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {!isSupported ? (
          <p className="text-sm text-landing-muted">
            Les notifications ne sont pas prises en charge par ce navigateur.
          </p>
        ) : subscription ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-landing-border bg-landing-background px-3.5 py-2.5">
              <p className="text-sm text-landing-foreground">Notifications activées sur cet appareil.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 cursor-pointer shrink-0"
                onClick={unsubscribeFromPush}
                disabled={isPending}
              >
                <BellOff className="h-3.5 w-3.5" />
                <span>Désactiver</span>
              </Button>
            </div>
            <div className="flex flex-col gap-1.5 pt-1">
              <p className="text-xs font-semibold text-landing-muted">Notification de test</p>
              <div className="flex gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Votre message..."
                  className="bg-input/40"
                />
                <Button
                  type="button"
                  size="icon"
                  className="shrink-0 cursor-pointer"
                  onClick={sendTestNotification}
                  disabled={isPending || !message}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Button
            type="button"
            className="w-full gap-2 cursor-pointer"
            onClick={subscribeToPush}
            disabled={isPending}
          >
            <Bell className="h-4 w-4" />
            <span>Activer les notifications</span>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
