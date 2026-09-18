import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getUserAccess } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getCircles } from "@/utils/actions/circles";
import { getAlbum, getAlbums } from "@/utils/actions/albums";
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
    getAlbums(babyId),
  ])

  if (!album) notFound()

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-6">
        <Link
          href={`/baby/${babyId}/albums`}
          className="inline-flex items-center gap-1 text-sm text-landing-muted hover:text-landing-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
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
