'use client'

import { useConfirm } from '@/components/confirm_provider'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tables } from '@utils/supabase/database.types'
import { sendBroadcast } from '@utils/actions/broadcast_email'

type Circle = Tables<'circles'>
type CircleAccess = Tables<'circles_access'>

interface SendBroadcastEmailProps {
  babyId: string
  circles: Circle[]
  circlesAccess: CircleAccess[]
  adminUserIds: string[]
}

export default function SendBroadcastEmail({ babyId, circles, circlesAccess, adminUserIds }: SendBroadcastEmailProps) {
  const t = useTranslations('admin')
  const confirmAction = useConfirm()
  const [isSending, startTransition] = useTransition()
  const [circleIds, setCircleIds] = useState<string[]>([])

  const circleItems = useMemo(
    () => Object.fromEntries(circles.map((circle) => [circle.id, circle.name])),
    [circles]
  )

  // Mirrors getVisibleUserIds in access.ts: no circle selected = admins
  // only, otherwise admins + members of the selected circles. Computed
  // client-side from data the admin page already fetched, just to preview
  // the recipient count in the confirm dialog below.
  const recipientCount = useMemo(() => {
    const ids = new Set(adminUserIds)
    if (circleIds.length > 0) {
      for (const access of circlesAccess) {
        if (circleIds.includes(access.circle_id)) ids.add(access.user_id)
      }
    }
    return ids.size
  }, [adminUserIds, circlesAccess, circleIds])

  async function handleSubmit(formData: FormData) {
    for (const circleId of circleIds) formData.append('circleIds', circleId)

    if (!(await confirmAction(t('broadcastConfirm', { count: recipientCount })))) return

    startTransition(async () => {
      try {
        const { sentCount } = await sendBroadcast(formData)
        toast.success(t('broadcastSent', { count: sentCount }))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('broadcastError'))
      }
    })
  }

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <Megaphone className="h-4.5 w-4.5 text-primary" />
          {t('broadcastTitle')}
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          {t('broadcastDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-3.5">
          <input type="hidden" name="babyId" value={babyId} />
          <Field>
            <FieldLabel htmlFor={`broadcast-subject-${babyId}`} className="sr-only">
              {t('broadcastSubjectPlaceholder')}
            </FieldLabel>
            <Input
              name="subject"
              id={`broadcast-subject-${babyId}`}
              placeholder={t('broadcastSubjectPlaceholder')}
              required
              className="w-full bg-input/40"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`broadcast-message-${babyId}`} className="sr-only">
              {t('broadcastMessagePlaceholder')}
            </FieldLabel>
            <textarea
              name="message"
              id={`broadcast-message-${babyId}`}
              placeholder={t('broadcastMessagePlaceholder')}
              required
              rows={4}
              className="w-full rounded-md border border-input bg-input/40 px-3 py-2 text-sm resize-none"
            />
          </Field>
          <Field>
            <FieldLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('broadcastCirclesLabel')}
            </FieldLabel>
            <Select
              items={circleItems}
              multiple
              value={circleIds}
              onValueChange={(value) => setCircleIds(value as string[])}
            >
              <SelectTrigger className="w-full text-foreground bg-input/40">
                <SelectValue placeholder={t('broadcastCirclesPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {circles.map((circle) => (
                    <SelectItem key={circle.id} value={circle.id}>{circle.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('broadcastCirclesHint')}
            </p>
          </Field>
          <FieldGroup>
            <Field>
              <input
                type="file"
                name="photo"
                accept="image/*"
                className="w-full text-xs text-landing-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
              />
            </Field>
            <Field>
              <Button type="submit" disabled={isSending} className="w-full rounded-2xl cursor-pointer gap-2">
                <Megaphone className="h-4 w-4" />
                <span>{isSending ? t('broadcastSending') : t('broadcastSend')}</span>
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
