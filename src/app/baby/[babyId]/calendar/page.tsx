import { getUserAccess } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getCircles, getCircleMemberCounts } from "@/utils/actions/circles";
import { getEvents, getEventActivityBeyond } from "@/utils/actions/events";
import { getPostsForRange, getPostActivityBeyond } from "@/utils/actions/posts";
import { getAuthUser } from "@/utils/supabase/auth";
import { logger } from "@/utils/logger";
import CalendarView from "./calendar_view";
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
    <div className="overflow-hidden text-landing-foreground">
      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
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
