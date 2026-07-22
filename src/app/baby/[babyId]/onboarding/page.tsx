import { redirect } from "next/navigation"
import { getAuthUser } from "@utils/supabase/auth"
import { createClient } from "@utils/supabase/server"
import { getBaby } from "@utils/actions/baby"
import { getUserAccess } from "@utils/actions/users"
import { OnboardingForm } from "@components/onboarding-form"

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ babyId: string }>
}) {
  const { babyId } = await params

  const { data: { user } } = await getAuthUser()
  if (!user) redirect('/login')

  const baby = await getBaby(babyId)
  if (!("baby_surname" in baby)) redirect('/')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access) || !access) redirect('/')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('users')
    .select('nickname')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex flex-col items-center justify-center bg-landing-background text-landing-foreground px-6 py-12 md:px-10 md:py-16">
      <div className="w-full max-w-sm md:max-w-4xl">
        <OnboardingForm
          babyId={babyId}
          babySurname={baby.baby_surname}
          nickname={profile?.nickname ?? ''}
          relationToBaby={access.relation_to_baby ?? ''}
        />
      </div>
    </div>
  )
}
