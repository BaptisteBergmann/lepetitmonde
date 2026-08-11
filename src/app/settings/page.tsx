import { getTranslations } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'
import { getBabiesList } from '@/utils/actions/baby'
import AccountCard from './_components/account_card'
import BabySettingsCard from './_components/baby_settings_card'
import NotificationsCard from './_components/notifications_card'
import InstallCard from '@/components/install-card'

export default async function SettingsPage() {
  const contextLogger = logger.child({ function: SettingsPage.name })
  const t = await getTranslations('settingsPage')
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    contextLogger.warn('No authenticated user on settings page')
  }

  const { data: profile } = user
    ? await supabase.from('users').select('first_name, last_name').eq('id', user.id).single()
    : { data: null }

  const tNav = await getTranslations('nav')
  const fullName = user?.user_metadata?.full_name || user?.email || tNav('unknownUser')
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part.charAt(0).toUpperCase())
    .join('') || 'U'

  const babies = await getBabiesList()

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        <div className="border-b border-landing-border pb-6">
          <h1 className="font-display text-3xl font-semibold">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-landing-muted sm:text-base">
            {t('subtitle')}
          </p>
        </div>

        <div className="space-y-6">
          <AccountCard
            initials={initials}
            fullName={fullName}
            email={user?.email}
            firstName={profile?.first_name ?? ''}
            lastName={profile?.last_name ?? ''}
          />

          {babies.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-lg font-semibold">{t('myJournals')}</h2>
              <div className="space-y-3">
                {babies.map((baby) => {
                  const access = baby.baby_access[0]
                  return (
                    <BabySettingsCard
                      key={baby.id}
                      babyId={baby.id}
                      babySurname={baby.baby_surname}
                      nickname={access?.nickname ?? ''}
                      relationToBaby={access?.relation_to_baby ?? ''}
                      isAdmin={access?.access_level === 'admin'}
                    />
                  )
                })}
              </div>
            </div>
          )}

          <NotificationsCard />
          <InstallCard />
        </div>
      </div>
    </div>
  )
}
