import Image from "next/image"
import { Button } from "@components/ui/button"
import { Card, CardContent } from "@components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@components/ui/field"
import { Input } from "@components/ui/input"
import { completeOnboarding } from "@utils/actions/onboarding"

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
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden border-landing-border bg-landing-surface p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form action={completeOnboarding} className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="font-display text-2xl font-semibold">Bienvenue !</h1>
                <p className="text-balance text-muted-foreground">
                  Avant de rejoindre le journal de {babySurname}, dites-nous qui vous êtes.
                </p>
              </div>

              <Field hidden>
                <FieldLabel htmlFor="babyId">Baby ID</FieldLabel>
                <Input name="babyId" id="babyId" type="text" required value={babyId} />
              </Field>

              <Field>
                <FieldLabel htmlFor="nickname">Comment vous appeler ?</FieldLabel>
                <Input
                  name="nickname"
                  id="nickname"
                  type="text"
                  placeholder="Mamie Jojo, Tonton Marc..."
                  defaultValue={nickname}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="relationToBaby">Votre lien avec {babySurname}</FieldLabel>
                <Input
                  name="relationToBaby"
                  id="relationToBaby"
                  type="text"
                  placeholder="Maman, Papa, Mamie, Tonton..."
                  defaultValue={relationToBaby}
                  required
                />
              </Field>

              <Field>
                <Button type="submit">Rejoindre le journal</Button>
              </Field>
            </FieldGroup>
          </form>
          <div className="hidden flex-col items-center justify-center gap-4 bg-landing-background p-8 md:flex">
            <Image src="/logo_mark.svg" alt="" width={512} height={512} className="h-20 w-auto" unoptimized />
            <p className="text-balance text-center font-display text-lg italic text-landing-foreground">
              Le journal de bébé, à partager en famille
            </p>
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        Vous pourrez toujours modifier ces informations plus tard.
      </FieldDescription>
    </div>
  )
}
