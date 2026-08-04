import { Suspense } from "react";
import { Loader2, BookOpen, Clock } from "lucide-react";
import { getUserAccess } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getCircles, getUserCircleIds } from "@/utils/actions/circles";
import { getPosts } from "@/utils/actions/posts";
import { getAuthUser } from "@/utils/supabase/auth";
import { logger } from "@/utils/logger";
import { withTiming } from "@/utils/timing";
import { Reveal } from "@components/reveal";
import FeedView from "./feed_view";

const PAGE_SIZE = 10;

export default async function FeedPage({
  params,
}: {
  params: Promise<{ babyId: string }>
}) {
  const { babyId } = await params;
  const contextLogger = logger.child({ function: FeedPage.name, babyId })

  await assertPageAccess(babyId, 'feed')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) {
    contextLogger.warn("User without baby access attempted to view feed")
    return null
  }
  const isAdmin = access.access_level === "admin"

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="relative mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
        />

        <Reveal className="relative flex flex-col items-center gap-2 pb-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <BookOpen className="h-5 w-5" />
          </span>
          <p className="text-xs font-semibold tracking-[0.16em] text-landing-camel uppercase">
            Page — Le quotidien
          </p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            Journal
          </h1>
          <p className="max-w-xs text-sm text-landing-muted sm:text-base">
            Les photos et souvenirs de bébé, partagés en famille.
          </p>
        </Reveal>

        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-landing-muted">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Chargement du journal...</p>
            </div>
          }
        >
          <FeedContent babyId={babyId} isAdmin={isAdmin} />
        </Suspense>
      </div>
    </div>
  );
}

async function FeedContent({ babyId, isAdmin }: { babyId: string; isAdmin: boolean }) {
  const contextLogger = logger.child({ function: FeedContent.name, babyId })
  const { data: { user } } = await getAuthUser()
  if (!user) return null

  if (!isAdmin) {
    const circleIds = await getUserCircleIds(babyId, user.id)
    if (circleIds.length === 0) {
      return <PendingCircleAccessNotice />
    }
  }

  const { result: [circles, posts], durationMs } = await withTiming(() => Promise.all([
    getCircles(babyId),
    getPosts(babyId, { limit: PAGE_SIZE }),
  ]))
  contextLogger.info({ durationMs, postCount: posts.length }, "Feed content loaded")

  return (
    <FeedView
      babyId={babyId}
      isAdmin={isAdmin}
      currentUserId={user.id}
      circles={circles}
      initialPosts={posts}
      pageSize={PAGE_SIZE}
    />
  )
}

function PendingCircleAccessNotice() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Clock className="h-5 w-5" />
      </span>
      <p className="max-w-xs text-sm text-landing-muted">
        Vous n&apos;êtes pas encore rattaché à un groupe de ce journal.
        L&apos;administrateur a été notifié et vous aurez accès au contenu
        dès qu&apos;il vous aura ajouté à un groupe.
      </p>
    </div>
  )
}
