'use client'

import { useId, useRef } from 'react'
import type { ChartBuild } from '@utils/growth-chart'
import { cn } from '@utils/utils'

// Renders a pre-built chart (see utils/growth-chart.ts). Points are real buttons so keyboard
// and screen-reader users can walk through every measurement; there is no hover tooltip,
// the selected point shows in the readout card instead.
export function GrowthChart({
  chart,
  unit,
  title,
  description,
  ageAxisLabel,
  stepLabel,
  pointLabel,
  selectedId,
  onSelect,
}: {
  chart: ChartBuild
  unit: string
  title: string
  description: string
  ageAxisLabel: string
  stepLabel: string
  pointLabel: (point: ChartBuild['points'][number]) => string
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const uid = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const { plot, points } = chart

  const move = (index: number, delta: number) => {
    const next = points[index + delta]
    if (!next) return
    onSelect(next.id)
    svgRef.current?.querySelector<SVGGElement>(`[data-point="${next.id}"]`)?.focus()
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      role="group"
      aria-labelledby={`${uid}-title ${uid}-desc`}
      className="h-auto w-full touch-pan-y"
    >
      <title id={`${uid}-title`}>{title}</title>
      <desc id={`${uid}-desc`}>{description}</desc>

      <g aria-hidden="true" className="pointer-events-none">
        {chart.yTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} className="stroke-border" strokeWidth={1} />
            <text x={plot.left - 6} y={tick.y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {tick.value}
            </text>
          </g>
        ))}
        <text x={plot.left - 6} y={plot.top - 5} textAnchor="end" className="fill-muted-foreground text-[11px]">
          {unit}
        </text>
        {chart.xTicks.map((tick) => (
          <text key={tick.value} x={tick.x} y={plot.bottom + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {tick.value}
          </text>
        ))}
        <text x={(plot.left + plot.right) / 2} y={chart.height - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">
          {ageAxisLabel}
        </text>

        <path d={chart.outerBand} className="fill-primary/10" />
        <path d={chart.innerBand} className="fill-primary/15" />
        {chart.edgeLines.map((d, i) => (
          <path key={i} d={d} fill="none" className="stroke-primary/30" strokeWidth={1} />
        ))}
        <path d={chart.medianLine} fill="none" className="stroke-primary/60" strokeWidth={1.5} />
        {chart.endLabels.map((item) => (
          <text key={item.label} x={plot.right + 4} y={item.y + 4} className="fill-muted-foreground text-[11px]">
            {item.label}
          </text>
        ))}

        {chart.stepX !== null && (
          <g>
            <line x1={chart.stepX} x2={chart.stepX} y1={plot.top} y2={plot.bottom} className="stroke-border" strokeDasharray="3 3" strokeWidth={1} />
            <text x={chart.stepX + 3} y={plot.top + 10} className="fill-muted-foreground text-[11px]">{stepLabel}</text>
          </g>
        )}

        {points.length > 1 && (
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            className="stroke-foreground"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </g>

      {points.map((point, index) => {
        const selected = point.id === selectedId
        return (
          <g
            key={point.id}
            data-point={point.id}
            role="button"
            tabIndex={0}
            aria-label={pointLabel(point)}
            aria-pressed={selected}
            onClick={() => onSelect(point.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(point.id) }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); move(index, -1) }
              else if (e.key === 'ArrowRight') { e.preventDefault(); move(index, 1) }
            }}
            className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-ring [&:focus-visible>circle:first-child]:stroke-2"
          >
            {/* 44px hit area, also the focus outline */}
            <circle cx={point.x} cy={point.y} r={22} className="fill-transparent stroke-transparent" />
            <circle
              cx={point.x}
              cy={point.y}
              r={9}
              fill="none"
              className={cn('stroke-chart-1 motion-safe:transition-opacity', selected ? 'opacity-100' : 'opacity-0')}
              strokeWidth={2}
            />
            <circle cx={point.x} cy={point.y} r={4.5} className="fill-chart-1 stroke-landing-surface" strokeWidth={2} />
          </g>
        )
      })}
    </svg>
  )
}
