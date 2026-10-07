import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getUserAccess } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getCircles } from "@/utils/actions/circles";
import { getAlbum, getAlbumOptions } from "@/utils/actions/albums";
import { logger } from "@/utils/logger";
import AlbumDetailView from "./_components/album_detail_view";

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ babyId: string; albumId: string }>
}) {
  const { babyId, albumId } = await params;
  const contextLogger = logger.child({ function: AlbumPage.name, babyId, albumId })
  const t = await getTranslations('albums')

  await assertPageAccess(babyId, 'albums')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) {
    contextLogger.warn("User without baby access attempted to view an album")
    return null
  }
  const isAdmin = access.access_level === "admin"

  const [album, circles, albums] = await Promise.all([
    getAlbum(albumId, babyId),
    getCircles(babyId),
    isAdmin ? getAlbumOptions(babyId) : Promise.resolve([]),
  ])

  if (!album) notFound()

  return (
    <div className="text-landing-foreground">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-6">
        <Link
          href={`/baby/${babyId}/albums`}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg py-2 text-sm text-landing-muted hover:text-landing-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {t('backToAlbums')}
        </Link>

        <AlbumDetailView
          babyId={babyId}
          isAdmin={isAdmin}
          circles={circles}
          albums={albums}
          album={album}
        />
      </div>
    </div>
  );
}
