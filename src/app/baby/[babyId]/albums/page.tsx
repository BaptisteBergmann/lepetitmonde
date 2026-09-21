import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Loader2, Clock } from "lucide-react";
import { getUserAccess } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getCircles, getUserCircleIds } from "@/utils/actions/circles";
import { getAlbums, getAllAlbumPhotos } from "@/utils/actions/albums";
import { getAuthUser } from "@/utils/supabase/auth";
import { logger } from "@/utils/logger";
import AlbumsView from "./_components/albums_view";

export default async function AlbumsPage({
  params,
}: {
  params: Promise<{ babyId: string }>
}) {
  const { babyId } = await params;
  const t = await getTranslations('albums')

  await assertPageAccess(babyId, 'albums')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) {
    logger.child({ function: AlbumsPage.name, babyId }).warn("User without baby access attempted to view albums")
    return null
  }
  const isAdmin = access.access_level === "admin"

  return (
    <div className="overflow-hidden text-landing-foreground">
      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-landing-muted">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">{t('loading')}</p>
            </div>
          }
        >
          <AlbumsContent babyId={babyId} isAdmin={isAdmin} />
        </Suspense>
      </div>
    </div>
  );
}

async function AlbumsContent({ babyId, isAdmin }: { babyId: string; isAdmin: boolean }) {
  const contextLogger = logger.child({ function: AlbumsContent.name, babyId })
  const { data: { user } } = await getAuthUser()
  if (!user) return null

  if (!isAdmin) {
    const circleIds = await getUserCircleIds(babyId, user.id)
    if (circleIds.length === 0) {
      return <PendingCircleAccessNotice />
    }
  }

  const [circles, albums, allPhotos] = await Promise.all([
    getCircles(babyId),
    getAlbums(babyId),
    getAllAlbumPhotos(babyId),
  ])
  contextLogger.info({ albumCount: albums.length, photoCount: allPhotos.length }, "Albums content loaded")

  return (
    <AlbumsView
      babyId={babyId}
      isAdmin={isAdmin}
      circles={circles}
      albums={albums}
      allPhotos={allPhotos}
    />
  )
}

async function PendingCircleAccessNotice() {
  const t = await getTranslations('albums')
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
