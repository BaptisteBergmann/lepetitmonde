import { getUserAccess } from "@/utils/actions/users";
import { getCircles } from "@/utils/actions/circles";
import { getEvents } from "@/utils/actions/events";
import { getPostsForRange } from "@/utils/actions/posts";
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

  const [{ data: { user } }, circles, events, posts] = await Promise.all([
    getAuthUser(),
    getCircles(babyId),
    getEvents(babyId, {
      from: formatISO(gridStart, { representation: "date" }),
      to: formatISO(gridEnd, { representation: "date" }),
    }),
    getPostsForRange(
      babyId,
      formatISO(gridStart, { representation: "date" }),
      formatISO(gridEnd, { representation: "date" }),
    ),
  ])

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
        />

        <Reveal className="relative flex flex-col items-center gap-2 pb-2 text-center">
          <p className="text-xs font-semibold tracking-[0.16em] text-landing-camel uppercase">
            Page — Les grandes étapes
          </p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            Calendrier
          </h1>
          <p className="max-w-xs text-sm text-landing-muted sm:text-base">
            Les événements et jalons de bébé, passés et à venir.
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
        />
      </div>
    </div>
  );
}
