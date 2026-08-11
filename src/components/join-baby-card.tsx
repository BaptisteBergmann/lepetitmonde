import Link from "next/link"
import { getTranslations } from "next-intl/server"
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

export async function JoinBabyCard({ token, babyId, babySurname, alreadyMember }: JoinBabyCardProps) {
  const t = await getTranslations("auth.invite")

  if (alreadyMember) {
    return (
      <Card className="max-w-md mx-auto border-landing-border bg-landing-surface">
        <CardContent className="space-y-4 p-6 text-center">
          <h1 className="font-display text-2xl font-semibold">{t("alreadyMemberTitle")}</h1>
          <p className="text-muted-foreground">
            {t("alreadyMemberDescription", { babySurname })}
          </p>
          <Link href={`/baby/${babyId}`} className={cn(buttonVariants(), "w-full")}>
            {t("accessJournal")}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-md mx-auto border-landing-border bg-landing-surface">
      <CardContent className="space-y-4 p-6 text-center">
        <h1 className="font-display text-2xl font-semibold">{t("joinTitle", { babySurname })}</h1>
        <p className="text-muted-foreground">
          {t("joinDescription", { babySurname })}
        </p>
        <form action={joinBabyWithInvitation}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit" className="w-full">{t("join")}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
