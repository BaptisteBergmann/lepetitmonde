import { cn } from "@utils/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { updatePassword } from "@utils/actions/reset-password"

interface ResetPasswordFormProps extends React.ComponentProps<"div"> {
  message?: string
}

export function ResetPasswordForm({
  message,
  className,
  ...props
}: ResetPasswordFormProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden border-landing-border bg-landing-surface p-0">
        <CardContent className="p-6 md:p-8">
          <form action={updatePassword}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="font-display text-2xl font-semibold">Nouveau mot de passe</h1>
                <p className="text-balance text-muted-foreground">
                  Choisissez un nouveau mot de passe
                </p>
              </div>
              {message && (
                <p className="text-sm text-center text-muted-foreground">{message}</p>
              )}
              <Field>
                <FieldLabel htmlFor="password">Nouveau mot de passe</FieldLabel>
                <Input name="password" id="password" type="password" required minLength={6} />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirmPassword">Confirmer le mot de passe</FieldLabel>
                <Input name="confirmPassword" id="confirmPassword" type="password" required minLength={6} />
              </Field>
              <Field>
                <Button type="submit">Mettre à jour</Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
