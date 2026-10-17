export default function Loading() {
  return (
    <div className="bg-landing-background text-landing-foreground" role="status" aria-busy="true">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-6">
        <div className="mx-auto h-8 w-48 rounded-xl bg-muted animate-pulse motion-reduce:animate-none" />
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      </div>
    </div>
  )
}
