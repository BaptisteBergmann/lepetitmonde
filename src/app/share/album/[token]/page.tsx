import { redirect } from "next/navigation";

// Links already sent use /share/album/<token>; keep them working.
export default async function LegacySharedAlbumPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params;
  redirect(`/share/${encodeURIComponent(token)}`);
}
