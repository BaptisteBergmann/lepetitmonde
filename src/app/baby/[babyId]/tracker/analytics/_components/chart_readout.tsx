'use client'

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@utils/utils'

// Shared by the two inspectable charts. Tap-to-inspect instead of a hover tooltip:
// hover doesn't exist on phones, so the selected column shows in an inline readout
// card, with precise previous/next buttons as the no-gesture path. Everything shown
// is a string prepared on the server, so no translator is needed here.

export type InspectItem = {
  title: string
  value: string
  detail: string | null
  // Table cells after the first (the title) column.
  cells: string[]
}

export type InspectTexts = {
  previous: string
  next: string
  showTable: string
  hideTable: string
  hint: string
  tableLabel: string
  rowHeader: string
}

export function useSelection(count: number, initial: number) {
  const [selected, setSelected] = useState(initial)
  const clamped = Math.min(Math.max(selected, 0), Math.max(count - 1, 0))
  return [clamped, (index: number) => setSelected(Math.min(Math.max(index, 0), Math.max(count - 1, 0)))] as const
}

export function valueText(item: InspectItem) {
  return item.detail ? `${item.title}. ${item.value}. ${item.detail}` : `${item.title}. ${item.value}`
}

// One tab stop per chart (30 stops would be hostile): the svg is a slider over the
// columns. Hit testing is by x across the whole plot height since bars can be ~10px wide.
export function SliderSvg({
  width,
  height,
  plot,
  slot,
  count,
  selected,
  onSelect,
  label,
  text,
  children,
}: {
  width: number
  height: number
  plot: { left: number; right: number; top: number; bottom: number }
  slot: number
  count: number
  selected: number
  onSelect: (index: number) => void
  label: string
  text: string
  children: ReactNode
}) {
  const pressed = useRef(false)

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const x = ((e.clientX - rect.left) / rect.width) * width
    onSelect(Math.floor((x - plot.left) / slot))
  }

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const next: Record<string, number> = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: count - 1 }
    if (!(e.key in next)) return
    e.preventDefault()
    onSelect(next[e.key])
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={selected}
      aria-valuetext={text}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => { pressed.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e) }}
      onPointerMove={(e) => { if (pressed.current) pick(e) }}
      onPointerUp={() => { pressed.current = false }}
      onPointerCancel={() => { pressed.current = false }}
      className="h-auto w-full touch-pan-y rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
    >
      <g aria-hidden="true">{children}</g>
    </svg>
  )
}

export function ChartReadout({
  item,
  selected,
  count,
  onSelect,
  texts,
}: {
  item: InspectItem
  selected: number
  count: number
  onSelect: (index: number) => void
  texts: Pick<InspectTexts, 'previous' | 'next'>
}) {
  return (
    <div aria-live="polite" className="space-y-1 rounded-2xl border border-landing-border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="icon-lg" className="rounded-2xl" aria-label={texts.previous} disabled={selected <= 0} onClick={() => onSelect(selected - 1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <p className="min-w-0 text-center font-display text-lg font-semibold capitalize">{item.title}</p>
        <Button type="button" variant="outline" size="icon-lg" className="rounded-2xl" aria-label={texts.next} disabled={selected >= count - 1} onClick={() => onSelect(selected + 1)}>
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <p className="text-center font-display text-xl font-semibold">{item.value}</p>
      {item.detail && <p className="text-center text-sm text-muted-foreground">{item.detail}</p>}
    </div>
  )
}

// The accessible source of truth for the chart. Rendered only while open, so a 90-row
// table doesn't double the DOM for everybody.
export function TableToggle({ items, headers, texts }: { items: InspectItem[]; headers: string[]; texts: InspectTexts }) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <div className="space-y-2">
      <Button type="button" variant="ghost" className="min-h-11 w-full gap-2" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown aria-hidden="true" /> : <Table2 aria-hidden="true" />}
        {open ? texts.hideTable : texts.showTable}
      </Button>
      {open && (
        <div
          id={id}
          role="region"
          tabIndex={0}
          aria-label={texts.tableLabel}
          className="max-h-72 overflow-y-auto rounded-2xl border border-landing-border motion-safe:animate-in motion-safe:fade-in"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">{texts.tableLabel}</caption>
            <thead className="sticky top-0 bg-landing-surface">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">{texts.rowHeader}</th>
                {headers.map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.title} className="border-t border-landing-border">
                  <th scope="row" className="px-3 py-2 text-left font-normal capitalize">{item.title}</th>
                  {item.cells.map((cell, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ChartCard({ title, summary, legend, children, className }: { title: string; summary: string; legend?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-3 rounded-2xl border border-landing-border bg-landing-surface p-3', className)}>
      <div className="space-y-1">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      </div>
      {children}
      {legend}
    </div>
  )
}
