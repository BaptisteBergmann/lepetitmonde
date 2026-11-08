import { CARE_KIND_CONFIG, CARE_TONE_CLASSES, type CareKind } from '@utils/care-events'
import { cn } from '@utils/utils'

// Section recognisable by icon and word, not color alone.
export function SectionHeading({ kind, label }: { kind: CareKind; label: string }) {
  const config = CARE_KIND_CONFIG[kind]
  const Icon = config.icon
  return (
    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <span className={cn('flex size-7 items-center justify-center rounded-full', CARE_TONE_CLASSES[config.tone])}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      {label}
    </h2>
  )
}
