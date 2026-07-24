'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { logout } from '@utils/actions/logout'
import { updateProfile, requestEmailChange } from '@utils/actions/users'
import { updatePassword } from '@utils/actions/reset-password'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { LogOut, UserCircle } from 'lucide-react'

interface AccountCardProps {
  initials: string
  fullName: string
  email?: string
  firstName: string
  lastName: string
}

export default function AccountCard({ initials, fullName, email, firstName, lastName }: AccountCardProps) {
  const [isSavingProfile, startProfileTransition] = useTransition()
  const [isSavingEmail, startEmailTransition] = useTransition()

  function handleProfileSubmit(formData: FormData) {
    startProfileTransition(async () => {
      try {
        await updateProfile(formData)
        toast.success('Profil mis à jour.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour du profil.")
      }
    })
  }

  function handleEmailSubmit(formData: FormData) {
    startEmailTransition(async () => {
      try {
        await requestEmailChange(formData)
        toast.success('Un email de confirmation a été envoyé à la nouvelle adresse.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors du changement d'email.")
      }
    })
  }

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <UserCircle className="h-4.5 w-4.5 text-primary" />
          Compte
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          Vos informations personnelles.
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
            <p className="text-xs font-semibold text-landing-muted -mt-1">Nom</p>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="firstName">Prénom</FieldLabel>
                <Input name="firstName" id="firstName" defaultValue={firstName} />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName">Nom</FieldLabel>
                <Input name="lastName" id="lastName" defaultValue={lastName} />
              </Field>
            </div>
            <Field>
              <Button type="submit" size="sm" variant="outline" disabled={isSavingProfile} className="cursor-pointer">
                Enregistrer
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <form action={handleEmailSubmit} className="border-t border-landing-border pt-4">
          <FieldGroup>
            <p className="text-xs font-semibold text-landing-muted -mt-1">Email</p>
            <Field>
              <FieldLabel htmlFor="email">Adresse email</FieldLabel>
              <Input name="email" id="email" type="email" defaultValue={email} required />
            </Field>
            <Field>
              <Button type="submit" size="sm" variant="outline" disabled={isSavingEmail} className="cursor-pointer">
                Changer d&apos;email
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <form action={updatePassword} className="border-t border-landing-border pt-4">
          <FieldGroup>
            <p className="text-xs font-semibold text-landing-muted -mt-1">Mot de passe</p>
            <Field>
              <FieldLabel htmlFor="password">Nouveau mot de passe</FieldLabel>
              <PasswordInput name="password" id="password" required minLength={6} />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirmPassword">Confirmer le mot de passe</FieldLabel>
              <PasswordInput name="confirmPassword" id="confirmPassword" required minLength={6} />
            </Field>
            <Field>
              <Button type="submit" size="sm" variant="outline" className="cursor-pointer">
                Changer le mot de passe
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <form action={logout} className="border-t border-landing-border pt-4">
          <Button type="submit" variant="destructive" className="w-full gap-2 cursor-pointer">
            <LogOut className="h-4 w-4" />
            <span>Se déconnecter</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
