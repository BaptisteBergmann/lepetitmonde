import { getTranslations } from "next-intl/server";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getTrackerDay, getTrackerNow } from "@/utils/actions/care_events";
import { getRequestTimeZone } from "@/utils/care-timezone";
import { parseDayParam, todayInZone, computeDayTotals, zonedDayBounds } from "@/utils/care-time";
import { formatDuration } from "@/utils/care-duration";
import { Reveal } from "@components/reveal";
import { AddEntryButton } from "./_components/add_entry_button";
import { CareLog } from "./_components/care_log";
import { NowPanel } from "./_components/now_panel";
import { DayNav } from "./_components/day_nav";
import { TrackerLive } from "./_components/tracker_live";
import { TzCookie } from "@components/tz_cookie";

export default async function TrackerPage({
  params,
  searchParams,
}: {
  params: Promise<{ babyId: string }>;
  searchParams: Promise<{ day?: string | string[] }>;
}) {
  const { babyId } = await params;
  const { day: dayParam } = await searchParams;
  const t = await getTranslations('tracker');

  await assertPageAccess(babyId, 'tracker');

  const tz = await getRequestTimeZone();
  const now = new Date();
  const today = todayInZone(tz, now);
  const day = parseDayParam(dayParam, tz, now);
  const bounds = zonedDayBounds(day, tz);

  const [events, nowState] = await Promise.all([getTrackerDay(babyId, day), getTrackerNow(babyId)]);

  const { feedCount, bottleMl, sleepMs } = computeDayTotals(events, bounds, now);
  const durationT = (key: 'hm' | 'h' | 'm', values: { h: number; m: number }) => t(`duration.${key}`, values);

  const stats = [
    { id: 'sleep', label: t('summary.sleep'), value: sleepMs > 0 ? formatDuration(sleepMs, durationT) : t('summary.none') },
    { id: 'feeds', label: t('summary.feeds', { count: feedCount }), value: String(feedCount) },
    { id: 'bottles', label: t('summary.bottles'), value: bottleMl > 0 ? t('summary.amount', { amount: bottleMl }) : t('summary.none') },
  ];

  return (
    <div className="text-landing-foreground">
      <TzCookie />
      <TrackerLive babyId={babyId} />
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-16">
        <Reveal className="border-b border-landing-border pb-4 mb-6">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-2 hidden max-w-xl text-sm text-landing-muted sm:block sm:text-base">
            {t('subtitle')}
          </p>
        </Reveal>

        <div className="space-y-8 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-8 md:space-y-0">
          <div className="md:sticky md:top-24">
            <NowPanel babyId={babyId} tz={tz} state={nowState} />
          </div>

          <div className="space-y-8">
            <DayNav babyId={babyId} day={day} today={today} />

            <dl aria-label={t('summary.label')} className="grid grid-cols-3 gap-2">
              {stats.map((stat) => (
                <div key={stat.id} className="flex flex-col-reverse rounded-2xl border border-landing-border bg-landing-surface p-3 text-center">
                  <dd className="font-display text-xl font-semibold">{stat.value}</dd>
                  <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                </div>
              ))}
            </dl>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('log.heading')}
                </h2>
                <AddEntryButton babyId={babyId} />
              </div>
              <CareLog babyId={babyId} events={events} day={day} tz={tz} isToday={day === today} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
