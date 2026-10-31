import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@utils/utils'

export type HealthView = 'growth' | 'vaccines'

// Links, not ARIA tabs: the view lives in the URL (?view=...), and both datasets are already
// in the page payload so switching is near-instant.
export async function ViewSwitch({
  babyId,
  active,
  overdueCount,
}: {
  babyId: string
  active: HealthView
  overdueCount: number
}) {
  const t = await getTranslations('health')
  const views: HealthView[] = ['growth', 'vaccines']

  return (
    <nav aria-label={t('views.label')} className="grid grid-cols-2 gap-2">
      {views.map((view) => {
        const isActive = view === active
        return (
          <Link
            key={view}
            href={`/baby/${babyId}/health?view=${view}`}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-border bg-input/50 px-2 text-sm font-medium outline-none transition-colors',
              'focus-visible:ring-3 focus-visible:ring-ring/30',
              isActive && 'border-primary bg-primary/15',
            )}
          >
            {isActive && <Check className="size-4" aria-hidden="true" />}
            <span>{t(`views.${view}`)}</span>
            {view === 'vaccines' && overdueCount > 0 && (
              <Badge variant="destructive">
                <span aria-hidden="true">{overdueCount}</span>
                <span className="sr-only">{t('views.overdueCount', { count: overdueCount })}</span>
              </Badge>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
