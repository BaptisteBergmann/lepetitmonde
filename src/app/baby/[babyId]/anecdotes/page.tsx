import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Loader2, Sparkles, Clock } from "lucide-react";
import { getUserAccess } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getCircles, getUserCircleIds } from "@/utils/actions/circles";
import { getAnecdotes } from "@/utils/actions/anecdotes";
import { getAuthUser } from "@/utils/supabase/auth";
import { logger } from "@/utils/logger";
import { Reveal } from "@components/reveal";
import AnecdotesView from "./_components/anecdotes_view";

const PAGE_SIZE = 20;

export default async function AnecdotesPage({
  params,
}: {
  params: Promise<{ babyId: string }>
}) {
  const { babyId } = await params;
  const contextLogger = logger.child({ function: AnecdotesPage.name, babyId })
  const t = await getTranslations('anecdotes')

  await assertPageAccess(babyId, 'anecdotes')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) {
    contextLogger.warn("User without baby access attempted to view anecdotes")
    return null
  }
  const isAdmin = access.access_level === "admin"

  return (
    <div className="overflow-hidden bg-landing-background text-landing-foreground">
      <div className="relative mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
        />

        <Reveal className="relative flex flex-col items-center gap-2 pb-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </span>
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

        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-landing-muted">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">{t('loading')}</p>
            </div>
          }
        >
          <AnecdotesContent babyId={babyId} isAdmin={isAdmin} />
        </Suspense>
      </div>
    </div>
  );
}

async function AnecdotesContent({ babyId, isAdmin }: { babyId: string; isAdmin: boolean }) {
  const contextLogger = logger.child({ function: AnecdotesContent.name, babyId })
  const { data: { user } } = await getAuthUser()
  if (!user) return null

  if (!isAdmin) {
    const circleIds = await getUserCircleIds(babyId, user.id)
    if (circleIds.length === 0) {
      return <PendingCircleAccessNotice />
    }
  }

  const [circles, anecdotes] = await Promise.all([
    getCircles(babyId),
    getAnecdotes(babyId, { limit: PAGE_SIZE }),
  ])
  contextLogger.info({ anecdoteCount: anecdotes.length }, "Anecdotes content loaded")

  return (
    <AnecdotesView
      babyId={babyId}
      isAdmin={isAdmin}
      circles={circles}
      initialAnecdotes={anecdotes}
      pageSize={PAGE_SIZE}
    />
  )
}

async function PendingCircleAccessNotice() {
  const t = await getTranslations('anecdotes')
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Clock className="h-5 w-5" />
      </span>
      <p className="max-w-xs text-sm text-landing-muted">
        {t('pendingAccess')}
      </p>
    </div>
  )
}
