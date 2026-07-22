import { getUserAccess } from "@/utils/actions/users";
import { getCircles } from "@/utils/actions/circles";
import { getEvents } from "@/utils/actions/events";
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

  const [circles, events] = await Promise.all([
    getCircles(babyId),
    getEvents(babyId, {
      from: formatISO(gridStart, { representation: "date" }),
      to: formatISO(gridEnd, { representation: "date" }),
    }),
  ])

  return (
    <div className="relative w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative flex flex-col items-center text-center gap-2 pb-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Calendrier
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-xs">
          Les événements et jalons de bébé, passés et à venir.
        </p>
      </div>

      <CalendarView
        babyId={babyId}
        isAdmin={isAdmin}
        month={format(month, "yyyy-MM")}
        events={events}
        circles={circles}
      />
    </div>
  );
}
