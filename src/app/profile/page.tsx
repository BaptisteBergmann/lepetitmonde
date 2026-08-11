import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function Profile() {
  const t = await getTranslations('profile')
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-landing-background text-landing-foreground">
      <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
        {t('settingsLink')}
      </Link>
      {t('greeting')}
    </div>
  );
}
