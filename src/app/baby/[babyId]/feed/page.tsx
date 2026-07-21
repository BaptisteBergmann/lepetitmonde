import { Suspense } from "react";
import { Loader2, Images } from "lucide-react";
import { getUserAccess } from "@/utils/actions/users";
import { getCircles } from "@/utils/actions/circles";
import { getPosts } from "@/utils/actions/posts";
import { logger } from "@/utils/logger";
import FeedView from "./feed_view";

const PAGE_SIZE = 10;

export default async function FeedPage({
  params,
}: {
  params: Promise<{ babyId: string }>
}) {
  const { babyId } = await params;
  const contextLogger = logger.child({ function: FeedPage.name, babyId })

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) {
    contextLogger.warn("User without baby access attempted to view feed")
    return null
  }
  const isAdmin = access.access_level === "admin"

  return (
    <div className="relative w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative flex flex-col items-center text-center gap-2 pb-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Images className="h-5 w-5" />
        </span>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Journal
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-xs">
          Les photos et souvenirs de bébé, partagés en famille.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Chargement du journal...</p>
          </div>
        }
      >
        <FeedContent babyId={babyId} isAdmin={isAdmin} />
      </Suspense>
    </div>
  );
}

async function FeedContent({ babyId, isAdmin }: { babyId: string; isAdmin: boolean }) {
  const [circles, posts] = await Promise.all([
    getCircles(babyId),
    getPosts(babyId, { limit: PAGE_SIZE }),
  ])

  return (
    <FeedView
      babyId={babyId}
      isAdmin={isAdmin}
      circles={circles}
      initialPosts={posts}
      pageSize={PAGE_SIZE}
    />
  )
}
