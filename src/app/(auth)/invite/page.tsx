import { SignupForm } from "@components/signup-form"
import { JoinBabyCard } from "@components/join-baby-card"
import { getAuthUser } from "@utils/supabase/auth"
import { createClient } from "@utils/supabase/server"

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; message?: string }>
}) {
  const params = await searchParams
  const token = params.token
  const message = params.message

  if (!token) {
    return (
      <div className="max-w-md space-y-4 text-center mx-auto">
        <h1 className="font-display text-2xl font-semibold text-destructive">Lien d&apos;invitation invalide</h1>
        <p className="text-muted-foreground">
          Vous devez utiliser un lien d&apos;invitation valide contenant un jeton sécurisé pour pouvoir créer un compte et rejoindre Le petit monde.
        </p>
      </div>
    )
  }

  // A user already logged in (e.g. with access to another baby) can't go
  // through account creation again — redeem the invite as a baby_access
  // grant for their existing account instead.
  const { data: { user } } = await getAuthUser()

  if (user) {
    const supabase = await createClient()

    const invitation = await supabase
      .from('invitations')
      .select('*, babies(baby_surname)')
      .eq('id', token)
      .single()

    const expired = !invitation.data || new Date(invitation.data.expires_at) < new Date()

    if (expired) {
      return (
        <div className="max-w-md space-y-4 text-center mx-auto">
          <h1 className="font-display text-2xl font-semibold text-destructive">Lien d&apos;invitation invalide</h1>
          <p className="text-muted-foreground">Ce lien d&apos;invitation est invalide ou a expiré.</p>
        </div>
      )
    }

    const access = await supabase
      .from('baby_access')
      .select('user_id')
      .eq('baby_id', invitation.data.baby_id)
      .eq('user_id', user.id)
      .maybeSingle()

    return (
      <JoinBabyCard
        token={token}
        babyId={invitation.data.baby_id}
        babySurname={invitation.data.babies?.baby_surname ?? ''}
        alreadyMember={!!access.data}
      />
    )
  }

  return <SignupForm token={token} message={message} />
}
