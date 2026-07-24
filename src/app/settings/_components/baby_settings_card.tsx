'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Baby as BabyIcon, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { updateBabyAccessSettings } from '@utils/actions/users'
import { getDisabledNotificationTypes, setNotificationPreference } from '@utils/actions/notifications'
import { NOTIFICATION_LABELS, ADMIN_ONLY_TYPES, ALL_NOTIFICATION_TYPES } from '@utils/notification-types'
import { Enums } from '@utils/supabase/database.types'

interface BabySettingsCardProps {
  babyId: string
  babySurname: string
  nickname: string
  relationToBaby: string
  isAdmin: boolean
}

export default function BabySettingsCard({
  babyId,
  babySurname,
  nickname,
  relationToBaby,
  isAdmin,
}: BabySettingsCardProps) {
  const [isSaving, startTransition] = useTransition()
  const [disabledTypes, setDisabledTypes] = useState<Set<Enums<'notification_type'>>>(new Set())

  useEffect(() => {
    getDisabledNotificationTypes(babyId).then((types) => setDisabledTypes(new Set(types)))
  }, [babyId])

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateBabyAccessSettings(babyId, formData)
        toast.success('Modifications enregistrées.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.")
      }
    })
  }

  async function togglePreference(type: Enums<'notification_type'>) {
    const nowEnabled = disabledTypes.has(type)
    await setNotificationPreference(babyId, type, nowEnabled)
    setDisabledTypes((prev) => {
      const next = new Set(prev)
      if (nowEnabled) next.delete(type)
      else next.add(type)
      return next
    })
  }

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <BabyIcon className="h-4.5 w-4.5 text-primary" />
          {babySurname}
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          Vos réglages pour ce journal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`nickname-${babyId}`}>Comment vous appeler</FieldLabel>
              <Input
                name="nickname"
                id={`nickname-${babyId}`}
                defaultValue={nickname}
                placeholder="Mamie Jojo, Tonton Marc..."
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`relation-${babyId}`}>Votre lien avec {babySurname}</FieldLabel>
              <Input
                name="relationToBaby"
                id={`relation-${babyId}`}
                defaultValue={relationToBaby}
                placeholder="Maman, Papa, Mamie, Tonton..."
              />
            </Field>
            <Field>
              <Button type="submit" size="sm" variant="outline" disabled={isSaving} className="cursor-pointer">
                Enregistrer
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <div className="flex flex-col gap-1.5 border-t border-landing-border pt-4">
          <p className="text-xs font-semibold text-landing-muted flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Me notifier pour
          </p>
          {ALL_NOTIFICATION_TYPES.filter((type) => isAdmin || !ADMIN_ONLY_TYPES.includes(type)).map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!disabledTypes.has(type)}
                onChange={() => togglePreference(type)}
                className="cursor-pointer"
              />
              {NOTIFICATION_LABELS[type]}
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
