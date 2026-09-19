import { getTranslations } from "next-intl/server"
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

export async function ForgotPasswordForm({
  message,
  className,
  ...props
}: ForgotPasswordFormProps) {
  const t = await getTranslations("auth.forgotPassword")
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden border-landing-border bg-landing-surface p-0">
        <CardContent className="p-6 md:p-8">
          <form action={requestPasswordReset}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
                <p className="text-balance text-muted-foreground">
                  {t("subtitle")}
                </p>
              </div>
              {message && (
                <p role="alert" className="text-sm text-center text-muted-foreground">{message}</p>
              )}
              <Field>
                <FieldLabel htmlFor="email">{t("emailLabel")}</FieldLabel>
                <Input
                  name="email"
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="m@example.com"
                  required
                />
              </Field>
              <Field>
                <Button type="submit">{t("submit")}</Button>
              </Field>
              <FieldDescription className="text-center">
                <a href="/login">{t("backToLogin")}</a>
              </FieldDescription>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
