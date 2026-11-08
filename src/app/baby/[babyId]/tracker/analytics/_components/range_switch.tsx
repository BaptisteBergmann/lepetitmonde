import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Check } from 'lucide-react'
import { ANALYTICS_RANGES, type AnalyticsRange } from '@utils/care-analytics'
import { cn } from '@utils/utils'

// Links, not ARIA tabs: the range lives in the URL (?range=), like health's ViewSwitch.
// The default range links to the bare URL.
export async function RangeSwitch({ babyId, active }: { babyId: string; active: AnalyticsRange }) {
  const t = await getTranslations('tracker.analytics')
  const base = `/baby/${babyId}/tracker/analytics`

  return (
    <nav aria-label={t('range.label')} className="grid grid-cols-4 gap-2">
      {ANALYTICS_RANGES.map((range) => {
        const isActive = range === active
        return (
          <Link
            key={range}
            href={range === '7d' ? base : `${base}?range=${range}`}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-border bg-input/50 px-2 text-sm font-medium outline-none transition-colors',
              'focus-visible:ring-3 focus-visible:ring-ring/30',
              isActive && 'border-primary bg-primary/15',
            )}
          >
            {isActive && <Check className="size-4" aria-hidden="true" />}
            <span>{t(`range.${range}`)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
