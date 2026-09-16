import { getTranslations } from "next-intl/server";
import { getSharedAlbum } from "@/utils/actions/albums";
import SharedAlbumView from "./_components/shared_album_view";

export default async function SharedAlbumPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params;
  const t = await getTranslations('shareAlbum')

  const album = await getSharedAlbum(token)

  if (!album) {
    return (
      <div className="bg-landing-background text-landing-foreground min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="font-display text-2xl font-semibold text-destructive">{t('invalidTitle')}</h1>
          <p className="text-muted-foreground">{t('invalidDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{album.name}</h1>
          <p className="text-sm text-landing-muted">{t('photoCount', { count: album.photos.length })}</p>
        </div>

        <SharedAlbumView album={album} />
      </div>
    </div>
  );
}
