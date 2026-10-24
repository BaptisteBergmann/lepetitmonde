'use client'

import { INPUT_LIMITS } from '@/utils/input-limits'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { logout } from '@utils/actions/logout'
import { updateProfile, requestEmailChange } from '@utils/actions/users'
import { changePassword } from '@utils/actions/reset-password'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/utils/password-policy'
import { Loader2, LogOut, UserCircle } from 'lucide-react'

interface AccountCardProps {
  initials: string
  fullName: string
  email?: string
  firstName: string
  lastName: string
}

export default function AccountCard({ initials, fullName, email, firstName, lastName }: AccountCardProps) {
  const t = useTranslations('settingsPage.account')
  const [isSavingProfile, startProfileTransition] = useTransition()
  const [isSavingEmail, startEmailTransition] = useTransition()
  const [isSavingPassword, startPasswordTransition] = useTransition()
  const tAuth = useTranslations('auth')
  const [currentPasswordError, setCurrentPasswordError] = useState(false)
  const currentPasswordRef = useRef<HTMLInputElement>(null)

  // onSubmit instead of a form action: React resets uncontrolled fields after
  // an action, which would wipe the new-password fields on every error.
  function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setCurrentPasswordError(false)
    startPasswordTransition(async () => {
      try {
        // Success redirects to /login on the server; only failures come back.
        const result = await changePassword(formData)
        if (!result) return
        switch (result.error) {
          case 'currentPasswordWrong': {
            setCurrentPasswordError(true)
            const input = currentPasswordRef.current
            if (input) {
              input.value = ''
              input.focus()
            }
            break
          }
          case 'passwordMismatch':
            toast.error(tAuth('passwordMismatch'))
            break
          case 'passwordTooShort':
            toast.error(tAuth('passwordTooShort', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }))
            break
          case 'tooManyAttempts':
            toast.error(tAuth('tooManyAttempts'))
            break
          default:
            toast.error(t('changePasswordError'))
        }
      } catch {
        // Network failure; a redirect on success is handled by Next.
        toast.error(t('changePasswordError'))
      }
    })
  }

  function handleProfileSubmit(formData: FormData) {
    startProfileTransition(async () => {
      try {
        await updateProfile(formData)
        toast.success(t('profileUpdated'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('profileUpdateError'))
      }
    })
  }

  function handleEmailSubmit(formData: FormData) {
    startEmailTransition(async () => {
      try {
        await requestEmailChange(formData)
        toast.success(t('emailChangeSent'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('emailChangeError'))
      }
    })
  }

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <UserCircle className="h-4.5 w-4.5 text-primary" />
          {t('title')}
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          {t('description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary font-bold text-sm">
            {initials}
          </div>
          <div className="flex flex-col min-w-0">
            <p className="text-sm font-semibold text-landing-foreground truncate">{fullName}</p>
            {email && (
              <p className="text-xs text-landing-muted truncate">{email}</p>
            )}
          </div>
        </div>

        <form action={handleProfileSubmit} className="border-t border-landing-border pt-4">
          <FieldGroup>
            <p className="text-xs font-semibold text-landing-muted -mt-1">{t('nameSection')}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="firstName">{t('firstNameLabel')}</FieldLabel>
                <Input name="firstName" id="firstName" maxLength={INPUT_LIMITS.personName} autoComplete="given-name" defaultValue={firstName} />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName">{t('lastNameLabel')}</FieldLabel>
                <Input name="lastName" id="lastName" maxLength={INPUT_LIMITS.personName} autoComplete="family-name" defaultValue={lastName} />
              </Field>
            </div>
            <Field>
              <Button type="submit" size="sm" variant="outline" disabled={isSavingProfile} className="cursor-pointer">
                {t('save')}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <form action={handleEmailSubmit} className="border-t border-landing-border pt-4">
          <FieldGroup>
            <p className="text-xs font-semibold text-landing-muted -mt-1">{t('emailSection')}</p>
            <Field>
              <FieldLabel htmlFor="email">{t('emailLabel')}</FieldLabel>
              <Input name="email" id="email" type="email" autoComplete="email" defaultValue={email} required />
            </Field>
            <Field>
              <Button type="submit" size="sm" variant="outline" disabled={isSavingEmail} className="cursor-pointer">
                {t('changeEmail')}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <form onSubmit={handlePasswordSubmit} className="border-t border-landing-border pt-4">
          <FieldGroup>
            <p className="text-xs font-semibold text-landing-muted -mt-1">{t('passwordSection')}</p>
            <Field>
              <FieldLabel htmlFor="currentPassword">{t('currentPasswordLabel')}</FieldLabel>
              {/* No minLength: accounts older than the 10-character rule may have shorter passwords. */}
              <PasswordInput
                ref={currentPasswordRef}
                name="currentPassword"
                id="currentPassword"
                autoComplete="current-password"
                required
                maxLength={PASSWORD_MAX_LENGTH}
                aria-invalid={currentPasswordError || undefined}
                aria-describedby={currentPasswordError ? 'currentPasswordError' : undefined}
              />
              {currentPasswordError && (
                <p id="currentPasswordError" role="alert" className="text-destructive text-xs">
                  {tAuth('currentPasswordWrong')}
                </p>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t('newPasswordLabel')}</FieldLabel>
              <PasswordInput name="password" id="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} aria-describedby="passwordHint" />
              <FieldDescription id="passwordHint" className="text-xs">{t('passwordHint', { min: PASSWORD_MIN_LENGTH })}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirmPassword">{t('confirmPasswordLabel')}</FieldLabel>
              <PasswordInput name="confirmPassword" id="confirmPassword" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
            </Field>
            <Field>
              <Button type="submit" size="sm" variant="outline" disabled={isSavingPassword} className="cursor-pointer">
                {isSavingPassword && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {t('changePassword')}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <form action={logout} className="border-t border-landing-border pt-4">
          <Button type="submit" variant="destructive" className="w-full gap-2 cursor-pointer">
            <LogOut className="h-4 w-4" />
            <span>{t('logout')}</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
