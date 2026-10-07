import AlbumsSkeleton from './_components/albums_skeleton'

// Same shell as albums/page.tsx so nothing jumps once the real content lands.
export default function Loading() {
  return (
    <div className="overflow-hidden text-landing-foreground">
      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        <AlbumsSkeleton />
      </div>
    </div>
  )
}
