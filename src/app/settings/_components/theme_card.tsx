'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Monitor, Moon, Palette, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { readThemePreference, subscribeThemePreference, writeThemePreference, type ThemePreference } from '@utils/theme'

const OPTIONS: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
]

export default function ThemeCard() {
  const t = useTranslations('settingsPage.themeCard')
  const preference = useSyncExternalStore(subscribeThemePreference, readThemePreference, () => 'system' as ThemePreference)

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <Palette className="h-4.5 w-4.5 text-primary" />
          {t('title')}
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          {t('description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div role="group" aria-label={t('title')} className="grid grid-cols-3 gap-2">
          {OPTIONS.map(({ value, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              variant={preference === value ? 'default' : 'outline'}
              aria-pressed={preference === value}
              className="cursor-pointer gap-1.5 rounded-2xl"
              onClick={() => writeThemePreference(value)}
            >
              <Icon className="h-4 w-4" />
              <span>{t(value)}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
