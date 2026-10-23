import { getLocale, getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import type { CareEvent } from '@utils/actions/care_events'
import { CARE_KIND_CONFIG, CARE_TONE_CLASSES } from '@utils/care-events'
import { formatDuration } from '@utils/care-duration'
import { todayInZone } from '@utils/care-time'
import { formatDateAtTimeParts } from '@utils/formatting'
import { cn } from '@utils/utils'
import { CareLogRow } from './care_log_row'
import { describeEvent } from './kind_ui'

export async function CareLog({
  babyId,
  events,
  day,
  tz,
  isToday,
}: {
  babyId: string
  events: CareEvent[]
  day: string
  tz: string
  isToday: boolean
}) {
  const t = await getTranslations('tracker')
  const tCommon = await getTranslations('common')
  const locale = await getLocale()

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-landing-border bg-landing-surface py-12 text-center text-landing-muted">
        <p className="font-semibold">{t(isToday ? 'log.emptyToday' : 'log.emptyDay')}</p>
        <p className="mt-1 px-4 text-sm">{t(isToday ? 'log.emptyTodayHint' : 'log.emptyDayHint')}</p>
      </div>
    )
  }

  // Time only when the instant falls on the selected day, otherwise "22 Oct at 22:30".
  const label = (iso: string) => {
    const parts = formatDateAtTimeParts(iso, locale, tz)
    return todayInZone(tz, new Date(iso)) === day ? parts.time : tCommon('dateAtTime', parts)
  }

  return (
    <ul className="space-y-2">
      {events.map((event) => {
        const config = CARE_KIND_CONFIG[event.kind]
        const Icon = config.icon
        const start = label(event.started_at)
        const durationMs = event.ended_at ? new Date(event.ended_at).getTime() - new Date(event.started_at).getTime() : null
        const timeLine = event.ongoing
          ? `${start} – ${t('log.ongoing')}`
          : event.ended_at
            ? `${start} – ${label(event.ended_at)}${durationMs !== null ? ` · ${formatDuration(durationMs, (key, values) => t(`duration.${key}`, values))}` : ''}`
            : start

        return (
          <li key={event.id}>
            <CareLogRow
              babyId={babyId}
              event={event}
              ariaLabel={t('log.editEntry', { summary: `${describeEvent(event, t)}, ${start}` })}
            >
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', CARE_TONE_CLASSES[config.tone])}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="block min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{describeEvent(event, t)}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {timeLine}
                  {event.ongoing && (
                    <Badge variant="secondary">
                      <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
                      {t('log.ongoing')}
                    </Badge>
                  )}
                </span>
                {event.note && <span className="line-clamp-2 block text-sm text-landing-foreground">{event.note}</span>}
                <span className="block text-xs text-muted-foreground">
                  {t('log.by', { name: event.created_by_name ?? tCommon('userFallback') })}
                </span>
              </span>
            </CareLogRow>
          </li>
        )
      })}
    </ul>
  )
}
