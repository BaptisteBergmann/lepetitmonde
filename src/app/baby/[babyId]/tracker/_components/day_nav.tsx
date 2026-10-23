import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { getDateFnsLocale } from '@utils/formatting'
import { shiftDay } from '@utils/care-time'
import { cn } from '@utils/utils'

export async function DayNav({ babyId, day, today }: { babyId: string; day: string; today: string }) {
  const t = await getTranslations('tracker.day')
  const locale = getDateFnsLocale(await getLocale())
  const isToday = day === today
  const base = `/baby/${babyId}/tracker`
  const hrefFor = (d: string) => (d === today ? base : `${base}?day=${d}`)
  const navClass = cn(buttonVariants({ variant: 'outline', size: 'icon-lg' }), 'rounded-2xl')

  return (
    <nav className="flex items-center justify-between gap-2">
      <Link href={hrefFor(shiftDay(day, -1))} aria-label={t('previous')} className={navClass}>
        <ChevronLeft aria-hidden="true" />
      </Link>
      <div className="flex min-w-0 flex-col items-center text-center">
        <h2 className="font-display text-lg font-semibold capitalize">
          {format(parseISO(day), 'EEEE d MMMM', { locale })}
        </h2>
        {isToday ? (
          <span className="text-xs text-muted-foreground">{t('today')}</span>
        ) : (
          <Link href={base} className="touch-target relative text-sm text-primary">
            {t('backToToday')}
          </Link>
        )}
      </div>
      {isToday ? (
        <button type="button" disabled aria-label={t('next')} className={cn(navClass, 'opacity-50')}>
          <ChevronRight aria-hidden="true" />
        </button>
      ) : (
        <Link href={hrefFor(shiftDay(day, 1))} aria-label={t('next')} className={navClass}>
          <ChevronRight aria-hidden="true" />
        </Link>
      )}
    </nav>
  )
}
