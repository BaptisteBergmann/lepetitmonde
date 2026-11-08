import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ChevronRight } from 'lucide-react'
import { buildTimelineRow } from '@utils/care-analytics-chart'
import { TIMELINE_MAX_DAYS, type TimelineDay } from '@utils/care-analytics'
import type { Formatters } from './analytics_format'

// 24h rows, newest first. Every row is one link to that day on Suivi, so there are no tiny
// per-block targets. Shapes carry the kind (bar = sleep, circle = breastfeed, diamond =
// bottle), color is only a second cue. The track is `isolate`, so its z-0/z-10 tiers stay
// local (docs/z-index.md).
export async function DayTimeline({
  babyId,
  days,
  totalDays,
  fmt,
}: {
  babyId: string
  days: TimelineDay[]
  totalDays: number
  fmt: Formatters
}) {
  const t = await getTranslations('tracker')
  const base = `/baby/${babyId}/tracker`
  const hours = [0, 6, 12, 18, 24]

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('analytics.sections.history')}</h2>

      <div className="space-y-1">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-4 rounded-md bg-chart-4/80" />
            {t('kinds.sleep')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-rose" />
            {t('kinds.breastfeed')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2.5 rotate-45 bg-sage" />
            {t('kinds.bottle')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-4 rounded-sm bg-foreground/10" />
            {t('analytics.metrics.night')}
          </span>
        </div>

        <div aria-hidden="true" className="flex gap-2 px-1 text-[11px] text-muted-foreground">
          <span className="w-14 shrink-0 sm:w-20" />
          <span className="relative h-4 flex-1">
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute top-0"
                style={{ left: `${(h / 24) * 100}%`, transform: i === 0 ? undefined : i === hours.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
              >
                {t('duration.h', { h, m: 0 })}
              </span>
            ))}
          </span>
          <span className="size-4 shrink-0" />
        </div>
      </div>

      <ul aria-label={t('analytics.timeline.label')} className="space-y-1">
        {days.map((day) => {
          const row = buildTimelineRow(day)
          const isToday = day.partial
          const href = isToday ? base : `${base}?day=${day.day}`
          const date = fmt.longDate(day.day)
          const label = day.logged
            ? t('analytics.timeline.openDay', {
                date,
                summary: t('analytics.timeline.summary', { sleep: fmt.duration(day.sleepMs), feeds: day.feedCount }),
              })
            : t('analytics.timeline.openDayEmpty', { date })

          return (
            <li key={day.day}>
              <Link
                href={href}
                aria-label={label}
                className="flex min-h-11 items-center gap-2 rounded-xl px-1 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <span className="flex w-14 shrink-0 flex-col text-xs leading-tight sm:w-20">
                  <span className="capitalize">{isToday ? t('analytics.timeline.today') : fmt.weekday(day.day)}</span>
                  <span className="text-muted-foreground">{fmt.dayNumber(day.day)}</span>
                </span>

                <span aria-hidden="true" className="relative isolate h-7 flex-1 overflow-hidden rounded-lg bg-muted/60">
                  {day.logged ? (
                    <>
                      {row.nightBlocks.map((b, i) => (
                        <span key={i} className="absolute inset-y-0 bg-foreground/5" style={{ left: `${b.left}%`, width: `${b.width}%` }} />
                      ))}
                      {row.sleeps.map((s, i) => (
                        <span
                          key={i}
                          className={[
                            'absolute inset-y-1 z-0 bg-chart-4/80',
                            s.continuesBefore ? 'rounded-l-none' : 'rounded-l-md',
                            s.continuesAfter || s.ongoing ? 'rounded-r-none' : 'rounded-r-md',
                            s.ongoing ? 'border-r-2 border-dashed border-foreground/60' : '',
                          ].join(' ')}
                          style={{ left: `${s.left}%`, width: `${s.width}%`, minWidth: '3px' }}
                        />
                      ))}
                      {row.feeds.map((f, i) =>
                        f.kind === 'bottle' ? (
                          <span key={i} className="absolute top-1/2 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-sage" style={{ left: `${f.left}%` }} />
                        ) : (
                          <span
                            key={i}
                            className={`absolute top-1/2 z-10 h-2.5 -translate-y-1/2 rounded-full bg-rose ${f.width < 1 ? '-translate-x-1/2' : ''}`}
                            style={{ left: `${f.left}%`, width: `${f.width}%`, minWidth: '10px' }}
                          />
                        ),
                      )}
                    </>
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                      {t('analytics.timeline.empty')}
                    </span>
                  )}
                </span>

                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          )
        })}
      </ul>

      {totalDays > TIMELINE_MAX_DAYS && (
        <p className="text-xs text-muted-foreground">{t('analytics.timeline.capNote', { count: TIMELINE_MAX_DAYS })}</p>
      )}
    </section>
  )
}
