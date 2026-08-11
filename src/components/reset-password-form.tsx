import { getTranslations } from "next-intl/server"
import { cn } from "@utils/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { updatePassword } from "@utils/actions/reset-password"

interface ResetPasswordFormProps extends React.ComponentProps<"div"> {
  message?: string
}

export async function ResetPasswordForm({
  message,
  className,
  ...props
}: ResetPasswordFormProps) {
  const t = await getTranslations("auth.resetPassword")
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden border-landing-border bg-landing-surface p-0">
        <CardContent className="p-6 md:p-8">
          <form action={updatePassword}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
                <p className="text-balance text-muted-foreground">
                  {t("subtitle")}
                </p>
              </div>
              {message && (
                <p className="text-sm text-center text-muted-foreground">{message}</p>
              )}
              <Field>
                <FieldLabel htmlFor="password">{t("newPasswordLabel")}</FieldLabel>
                <PasswordInput name="password" id="password" required minLength={6} />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirmPassword">{t("confirmPasswordLabel")}</FieldLabel>
                <PasswordInput name="confirmPassword" id="confirmPassword" required minLength={6} />
              </Field>
              <Field>
                <Button type="submit">{t("submit")}</Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
