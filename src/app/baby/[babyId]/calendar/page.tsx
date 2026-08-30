import { getTranslations } from "next-intl/server";
import { getUserAccess } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getCircles, getCircleMemberCounts } from "@/utils/actions/circles";
import { getEvents, getEventActivityBeyond } from "@/utils/actions/events";
import { getPostsForRange, getPostActivityBeyond } from "@/utils/actions/posts";
import { getAuthUser } from "@/utils/supabase/auth";
import { logger } from "@/utils/logger";
import CalendarView from "./calendar_view";
import { Reveal } from "@components/reveal";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, formatISO, format, parse, isValid } from "date-fns";

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ babyId: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { babyId } = await params;
  const { month: monthParam } = await searchParams;
  const contextLogger = logger.child({ function: CalendarPage.name, babyId })
  const t = await getTranslations('calendar')

  await assertPageAccess(babyId, 'calendar')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) {
    contextLogger.warn("User without baby access attempted to view calendar")
    return null
  }
  const isAdmin = access.access_level === "admin"

  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date()
  const month = isValid(parsedMonth) ? parsedMonth : new Date()

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })

  const rangeFrom = formatISO(gridStart, { representation: "date" })
  const rangeTo = formatISO(gridEnd, { representation: "date" })

  const [{ data: { user } }, circles, circleMemberCounts, events, posts, eventActivity, postActivity] = await Promise.all([
    getAuthUser(),
    getCircles(babyId),
    getCircleMemberCounts(babyId),
    getEvents(babyId, { from: rangeFrom, to: rangeTo }),
    getPostsForRange(babyId, rangeFrom, rangeTo),
    getEventActivityBeyond(babyId, rangeFrom, rangeTo),
    getPostActivityBeyond(babyId, rangeFrom, rangeTo),
  ])

  const hasEarlierActivity = eventActivity.hasBefore || postActivity.hasBefore
  const hasLaterActivity = eventActivity.hasAfter || postActivity.hasAfter

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
        />

        <Reveal className="relative flex flex-col items-center gap-2 pb-2 text-center">
          <p className="text-xs font-semibold tracking-[0.16em] text-landing-camel uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            {t('title')}
          </h1>
          <p className="max-w-xs text-sm text-landing-muted sm:text-base">
            {t('subtitle')}
          </p>
        </Reveal>

        <CalendarView
          babyId={babyId}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? null}
          month={format(month, "yyyy-MM")}
          events={events}
          posts={posts}
          circles={circles}
          circleMemberCounts={circleMemberCounts}
          hasEarlierActivity={hasEarlierActivity}
          hasLaterActivity={hasLaterActivity}
        />
      </div>
    </div>
  );
}
