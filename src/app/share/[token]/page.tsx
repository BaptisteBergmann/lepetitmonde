import type { Metadata } from "next";
import { Link2Off } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { openSharedPhotos } from "@utils/album-share";
import SharedPhotosView from "./_components/shared_photos_view";

// Share links are bearer URLs: keep them out of search indexes.
// referrer: the token is in the URL, so never leak it via Referer if the page links out.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharedPhotosPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params;
  const t = await getTranslations('shareAlbum')

  const shared = await openSharedPhotos(token, await headers())

  if (!shared) {
    return (
      <div className="bg-landing-background text-landing-foreground min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md space-y-3 text-center">
          <Link2Off className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="font-display text-2xl font-semibold text-foreground">{t('invalidTitle')}</h1>
          <p className="text-muted-foreground">{t('invalidDescription')}</p>
        </div>
      </div>
    )
  }

  const isSingle = shared.kind === 'photos' && shared.photos.length === 1
  const title = shared.name ?? (isSingle ? t('photoTitle') : t('selectionTitle'))

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-6">
        <div className="text-center space-y-1 min-w-0">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl break-words">{title}</h1>
          {shared.photos.length > 0 && !isSingle && (
            <p className="text-sm text-landing-muted">{t('photoCount', { count: shared.photos.length })}</p>
          )}
        </div>

        {shared.photos.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <SharedPhotosView photos={shared.photos} title={title} single={isSingle} />
        )}
      </div>
    </div>
  );
}
