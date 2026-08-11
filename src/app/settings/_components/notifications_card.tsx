'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { sendNotification } from '@utils/actions/notifications'
import { usePushSubscription } from '@utils/hooks/use-push-subscription'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, BellOff, Send } from 'lucide-react'

export default function NotificationsCard() {
  const t = useTranslations('settingsPage.notificationsCard')
  const { isSupported, subscription, isPending, subscribe, unsubscribe } = usePushSubscription()
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)

  async function sendTestNotification() {
    if (!subscription || !message) return
    setIsSending(true)
    try {
      await sendNotification(message)
      setMessage('')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <Bell className="h-4.5 w-4.5 text-primary" />
          {t('title')}
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          {t('description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {!isSupported ? (
          <p className="text-sm text-landing-muted">
            {t('unsupported')}
          </p>
        ) : subscription ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-landing-border bg-landing-background px-3.5 py-2.5">
              <p className="text-sm text-landing-foreground">{t('enabledOnDevice')}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 cursor-pointer shrink-0"
                onClick={unsubscribe}
                disabled={isPending}
              >
                <BellOff className="h-3.5 w-3.5" />
                <span>{t('disable')}</span>
              </Button>
            </div>
            <div className="flex flex-col gap-1.5 pt-1">
              <p className="text-xs font-semibold text-landing-muted">{t('testNotification')}</p>
              <div className="flex gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('testMessagePlaceholder')}
                  className="bg-input/40"
                />
                <Button
                  type="button"
                  size="icon"
                  className="shrink-0 cursor-pointer"
                  onClick={sendTestNotification}
                  disabled={isSending || !message}
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
            onClick={subscribe}
            disabled={isPending}
          >
            <Bell className="h-4 w-4" />
            <span>{t('enable')}</span>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
