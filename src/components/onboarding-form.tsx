'use client'

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Bell } from "lucide-react"
import { Button } from "@components/ui/button"
import { Card, CardContent } from "@components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@components/ui/field"
import { Input } from "@components/ui/input"
import InstallCard from "@components/install-card"
import { completeOnboarding } from "@utils/actions/onboarding"
import { usePushSubscription } from "@utils/hooks/use-push-subscription"

interface OnboardingFormProps {
  babyId: string
  babySurname: string
  nickname: string
  relationToBaby: string
}

export function OnboardingForm({
  babyId,
  babySurname,
  nickname,
  relationToBaby,
}: OnboardingFormProps) {
  const router = useRouter()
  const t = useTranslations('onboarding')
  const tAuth = useTranslations('auth.login')
  const tNotif = useTranslations('notifications')
  const [step, setStep] = useState<'profile' | 'notifications'>('profile')
  const [isSaving, startTransition] = useTransition()
  const { isSupported, subscription, isPending: isSubscribing, subscribe } = usePushSubscription()

  function handleProfileSubmit(formData: FormData) {
    startTransition(async () => {
      await completeOnboarding(formData)
      setStep('notifications')
    })
  }

  function goToFeed() {
    router.push(`/baby/${babyId}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden border-landing-border bg-landing-surface p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          {step === 'profile' ? (
            <form action={handleProfileSubmit} className="p-6 md:p-8">
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="font-display text-2xl font-semibold">{t('welcome')}</h1>
                  <p className="text-balance text-muted-foreground">
                    {t('introWithBaby', { babySurname })}
                  </p>
                </div>

                <Field hidden>
                  <FieldLabel htmlFor="babyId">{t('babyIdLabel')}</FieldLabel>
                  <Input name="babyId" id="babyId" type="text" required value={babyId} readOnly />
                </Field>

                <Field>
                  <FieldLabel htmlFor="nickname">{t('nicknameLabel')}</FieldLabel>
                  <Input
                    name="nickname"
                    id="nickname"
                    type="text"
                    autoComplete="nickname"
                    placeholder={t('nicknamePlaceholder')}
                    defaultValue={nickname}
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="relationToBaby">{t('relationLabel', { babySurname })}</FieldLabel>
                  <Input
                    name="relationToBaby"
                    id="relationToBaby"
                    type="text"
                    placeholder={t('relationPlaceholder')}
                    defaultValue={relationToBaby}
                    required
                  />
                </Field>

                <Field>
                  <Button type="submit" disabled={isSaving} className="cursor-pointer">
                    {t('continue')}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center md:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bell className="h-6 w-6" />
              </div>
              <h1 className="font-display text-2xl font-semibold">{t('notifyTitle')}</h1>
              <p className="text-balance text-muted-foreground">
                {t('notifyDescription', { babySurname })}
              </p>
              <FieldGroup className="w-full gap-2 pt-2">
                {!isSupported ? (
                  <InstallCard
                    title={tNotif('installAppTitle')}
                    description={tNotif('installAppDescription')}
                  />
                ) : subscription ? (
                  <Button type="button" disabled className="gap-2">
                    <Bell className="h-4 w-4" />
                    {t('notificationsEnabled')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="gap-2 cursor-pointer"
                    onClick={subscribe}
                    disabled={isSubscribing}
                  >
                    <Bell className="h-4 w-4" />
                    {tNotif('enableNotifications')}
                  </Button>
                )}
                <Button type="button" variant="ghost" className="cursor-pointer" onClick={goToFeed}>
                  {subscription ? t('continue') : t('later')}
                </Button>
              </FieldGroup>
            </div>
          )}
          <div className="hidden flex-col items-center justify-center gap-4 bg-landing-background p-8 md:flex">
            <Image src="/logo_mark.svg" alt="" width={512} height={512} className="h-20 w-auto" unoptimized />
            <p className="text-balance text-center font-display text-lg italic text-landing-foreground">
              {tAuth('tagline')}
            </p>
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        {t('editLaterNotice')}
      </FieldDescription>
    </div>
  )
}
