import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'
import AccountCard from './_components/account_card'
import NotificationsCard from './_components/notifications_card'
import InstallCard from '@/components/install-card'

export default async function SettingsPage() {
  const contextLogger = logger.child({ function: SettingsPage.name })
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    contextLogger.warn('No authenticated user on settings page')
  }

  const fullName = user?.user_metadata?.full_name || user?.email || 'Utilisateur'
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part.charAt(0).toUpperCase())
    .join('') || 'U'

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        <div className="border-b border-landing-border pb-6">
          <h1 className="font-display text-3xl font-semibold">
            Paramètres
          </h1>
          <p className="mt-2 max-w-xl text-sm text-landing-muted sm:text-base">
            Gérez votre compte et les préférences de l&apos;application.
          </p>
        </div>

        <div className="space-y-6">
          <AccountCard initials={initials} fullName={fullName} email={user?.email} />
          <NotificationsCard />
          <InstallCard />
        </div>
      </div>
    </div>
  )
}
