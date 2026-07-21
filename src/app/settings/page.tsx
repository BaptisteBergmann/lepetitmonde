import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'
import AccountCard from './_components/account_card'
import NotificationsCard from './_components/notifications_card'
import InstallCard from './_components/install_card'

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
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-primary/80 to-rose bg-clip-text text-transparent flex items-center gap-2">
          ⚙️ Paramètres
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-xl">
          Gérez votre compte et les préférences de l&apos;application.
        </p>
      </div>

      <div className="space-y-6">
        <AccountCard initials={initials} fullName={fullName} email={user?.email} />
        <NotificationsCard />
        <InstallCard />
      </div>
    </div>
  )
}
