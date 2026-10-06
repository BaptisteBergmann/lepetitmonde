// Server-safe (no hooks): rendered by loading.tsx and the page's Suspense
// fallback. Mirrors the real tray + card layout and colours so nothing jumps
// when the content lands.
export default function FeedSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="space-y-4 animate-pulse motion-reduce:animate-none">
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <div className="size-14 rounded-full bg-landing-border" />
              <div className="h-2.5 w-10 rounded-full bg-landing-border" />
            </div>
          ))}
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="overflow-hidden rounded-3xl border border-landing-border bg-landing-surface">
            <div className="aspect-square bg-landing-background" />
            <div className="p-4 space-y-3">
              <div className="h-3.5 w-40 rounded-full bg-landing-border" />
              <div className="h-3 w-3/4 rounded-full bg-landing-border" />
              <div className="size-7 rounded-full bg-landing-border" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
