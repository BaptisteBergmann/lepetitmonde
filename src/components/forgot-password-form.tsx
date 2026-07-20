import { cn } from "@utils/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { requestPasswordReset } from "@utils/actions/reset-password"

interface ForgotPasswordFormProps extends React.ComponentProps<"div"> {
  message?: string
}

export function ForgotPasswordForm({
  message,
  className,
  ...props
}: ForgotPasswordFormProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="p-6 md:p-8">
          <form action={requestPasswordReset}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
                <p className="text-balance text-muted-foreground">
                  Entrez votre email pour recevoir un lien de réinitialisation
                </p>
              </div>
              {message && (
                <p className="text-sm text-center text-muted-foreground">{message}</p>
              )}
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  name="email"
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                />
              </Field>
              <Field>
                <Button type="submit">Envoyer le lien</Button>
              </Field>
              <FieldDescription className="text-center">
                <a href="/login">Retour à la connexion</a>
              </FieldDescription>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
