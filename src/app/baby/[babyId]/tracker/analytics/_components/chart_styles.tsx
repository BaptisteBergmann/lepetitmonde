import { cn } from '@utils/utils'

// Shared by the server legends and the client SVG charts. Not a 'use client' file, so
// both sides can import the values. Color is never the only cue: each series also
// differs by pattern (solid, hatch, dots) or shape (dot, square).
export type BarStyle = 'night' | 'day' | 'naps' | 'breast' | 'bottle' | 'ml'
export type DotStyle = 'stretch' | 'median' | 'gap'

export const BAR_STYLES: Record<BarStyle, { fill: string; pattern?: 'hatch' | 'dots'; patternClass?: string; swatch: string }> = {
  night: { fill: 'fill-chart-4', swatch: 'bg-chart-4' },
  day: {
    fill: 'fill-chart-4/25',
    pattern: 'hatch',
    patternClass: 'stroke-chart-4',
    swatch: 'bg-chart-4/25 bg-[repeating-linear-gradient(45deg,var(--color-chart-4)_0_2px,transparent_2px_6px)]',
  },
  naps: { fill: 'fill-chart-4/70', swatch: 'bg-chart-4/70' },
  breast: { fill: 'fill-rose', swatch: 'bg-rose' },
  bottle: {
    fill: 'fill-sage/40',
    pattern: 'dots',
    patternClass: 'fill-sage',
    swatch: 'bg-sage/40 bg-[radial-gradient(var(--color-sage)_1.2px,transparent_1.6px)] bg-[length:5px_5px]',
  },
  ml: { fill: 'fill-sage', swatch: 'bg-sage' },
}

export function Swatch({ style, className }: { style: BarStyle; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-3 shrink-0 rounded-sm', BAR_STYLES[style].swatch, className)} />
}

export function LegendItem({ style, label }: { style: BarStyle; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Swatch style={style} />
      {label}
    </span>
  )
}

export function Legend({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{children}</div>
}
