import { getTranslations } from "next-intl/server"
import { SignupForm } from "@components/signup-form"
import { JoinBabyCard } from "@components/join-baby-card"
import { getAuthUser } from "@utils/supabase/auth"
import { createClient } from "@utils/supabase/server"
import { findValidInvitation } from "@utils/invitations"

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; message?: string }>
}) {
  const params = await searchParams
  const token = params.token
  const message = params.message
  const t = await getTranslations("auth.invite")
  const tCommon = await getTranslations("common")

  if (!token) {
    return (
      <div className="max-w-md space-y-4 text-center mx-auto">
        <h1 className="font-display text-2xl font-semibold text-destructive">{t("invalidTitle")}</h1>
        <p className="text-muted-foreground">
          {t("invalidTokenDescription", { appName: tCommon("appName") })}
        </p>
      </div>
    )
  }

  // A user already logged in (e.g. with access to another baby) can't go
  // through account creation again — redeem the invite as a baby_access
  // grant for their existing account instead.
  const { data: { user } } = await getAuthUser()

  if (user) {
    // Service role: the caller isn't a member of this baby yet, so the user
    // client can't read the invitation or the baby's name.
    const invitation = await findValidInvitation(token)

    if (!invitation) {
      return (
        <div className="max-w-md space-y-4 text-center mx-auto">
          <h1 className="font-display text-2xl font-semibold text-destructive">{t("invalidTitle")}</h1>
          <p className="text-muted-foreground">{t("expiredDescription")}</p>
        </div>
      )
    }

    // Own row only, so the user client is enough.
    const supabase = await createClient()
    const access = await supabase
      .from('baby_access')
      .select('user_id')
      .eq('baby_id', invitation.babyId)
      .eq('user_id', user.id)
      .maybeSingle()

    return (
      <JoinBabyCard
        token={token}
        babyId={invitation.babyId}
        babySurname={invitation.babySurname}
        alreadyMember={!!access.data}
      />
    )
  }

  return <SignupForm token={token} message={message} />
}
