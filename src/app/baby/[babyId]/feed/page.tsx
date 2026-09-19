import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Loader2, BookOpen, Clock } from "lucide-react";
import { getUserAccess } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getCircles, getCircleMemberCounts, getUserCircleIds } from "@/utils/actions/circles";
import { getPosts, getPostById } from "@/utils/actions/posts";
import { getActiveStories } from "@/utils/actions/stories";
import { getHighlights } from "@/utils/actions/story_highlights";
import { getAuthUser } from "@/utils/supabase/auth";
import { logger } from "@/utils/logger";
import { withTiming } from "@/utils/timing";
import { Reveal } from "@components/reveal";
import FeedView from "./feed_view";

const PAGE_SIZE = 10;

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ babyId: string }>
  searchParams: Promise<{ postId?: string; storyId?: string }>
}) {
  const { babyId } = await params;
  const { postId, storyId } = await searchParams;
  const contextLogger = logger.child({ function: FeedPage.name, babyId })
  const t = await getTranslations('feed')

  await assertPageAccess(babyId, 'feed')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) {
    contextLogger.warn("User without baby access attempted to view feed")
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
            <BookOpen className="h-5 w-5" />
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
          <FeedContent babyId={babyId} isAdmin={isAdmin} highlightPostId={postId} highlightStoryId={storyId} />
        </Suspense>
      </div>
    </div>
  );
}

async function FeedContent({ babyId, isAdmin, highlightPostId, highlightStoryId }: { babyId: string; isAdmin: boolean; highlightPostId?: string; highlightStoryId?: string }) {
  const contextLogger = logger.child({ function: FeedContent.name, babyId })
  const { data: { user } } = await getAuthUser()
  if (!user) return null

  if (!isAdmin) {
    const circleIds = await getUserCircleIds(babyId, user.id)
    if (circleIds.length === 0) {
      return <PendingCircleAccessNotice />
    }
  }

  const { result: [circles, circleMemberCounts, posts, highlights, stories, targetPost], durationMs } = await withTiming(() => Promise.all([
    getCircles(babyId),
    getCircleMemberCounts(babyId),
    getPosts(babyId, { limit: PAGE_SIZE }),
    getHighlights(babyId),
    getActiveStories(babyId),
    highlightPostId ? getPostById(highlightPostId, babyId) : Promise.resolve(null),
  ]))

  // If the deep-linked post isn't already on the first page, prepend it so
  // it's in the DOM to scroll to — but keep `hasMore` derived from the
  // original page size, not the prepended length (see feed_view.tsx).
  const initialHasMore = posts.length === PAGE_SIZE
  const initialPosts = targetPost && !posts.some((post) => post.id === targetPost.id)
    ? [targetPost, ...posts]
    : posts

  contextLogger.info({ durationMs, postCount: initialPosts.length, highlightPostId }, "Feed content loaded")

  return (
    <FeedView
      babyId={babyId}
      isAdmin={isAdmin}
      currentUserId={user.id}
      circles={circles}
      circleMemberCounts={circleMemberCounts}
      initialPosts={initialPosts}
      pageSize={PAGE_SIZE}
      initialHasMore={initialHasMore}
      initialHighlights={highlights}
      initialStories={stories}
      highlightPostId={targetPost ? targetPost.id : undefined}
      highlightStoryId={highlightStoryId}
    />
  )
}

async function PendingCircleAccessNotice() {
  const t = await getTranslations('feed')
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
