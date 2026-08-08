import Link from "next/link"
import { Button, buttonVariants } from "@components/ui/button"
import { Card, CardContent } from "@components/ui/card"
import { cn } from "@utils/utils"
import { joinBabyWithInvitation } from "@utils/actions/join-baby"

interface JoinBabyCardProps {
  token: string
  babyId: string
  babySurname: string
  alreadyMember: boolean
}

export function JoinBabyCard({ token, babyId, babySurname, alreadyMember }: JoinBabyCardProps) {
  if (alreadyMember) {
    return (
      <Card className="max-w-md mx-auto border-landing-border bg-landing-surface">
        <CardContent className="space-y-4 p-6 text-center">
          <h1 className="font-display text-2xl font-semibold">Vous êtes déjà membre</h1>
          <p className="text-muted-foreground">
            Vous avez déjà accès au journal de {babySurname}.
          </p>
          <Link href={`/baby/${babyId}`} className={cn(buttonVariants(), "w-full")}>
            Accéder au journal
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-md mx-auto border-landing-border bg-landing-surface">
      <CardContent className="space-y-4 p-6 text-center">
        <h1 className="font-display text-2xl font-semibold">Rejoindre {babySurname}</h1>
        <p className="text-muted-foreground">
          Vous êtes déjà connecté. Rejoignez le journal de {babySurname} avec votre compte existant.
        </p>
        <form action={joinBabyWithInvitation}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit" className="w-full">Rejoindre</Button>
        </form>
      </CardContent>
    </Card>
  )
}
