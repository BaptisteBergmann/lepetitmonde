'use client'

import { useId, type ReactNode } from 'react'
import type { BarChartBuild } from '@utils/care-analytics-chart'
import { cn } from '@utils/utils'
import { BAR_STYLES, type BarStyle } from './chart_styles'
import { ChartCard, ChartReadout, SliderSvg, TableToggle, useSelection, valueText, type InspectItem, type InspectTexts } from './chart_readout'

// Single and stacked bars (sleep, naps, feeds, bottle ml). Renders a chart built by
// buildBarChart; series styles line up with the builder's series order (bottom to top).
export function InspectBarChart({
  title,
  summary,
  legend,
  chart,
  styles,
  axisLabels,
  averageLabel,
  items,
  tableHeaders,
  texts,
}: {
  title: string
  summary: string
  legend?: ReactNode
  chart: BarChartBuild
  styles: BarStyle[]
  axisLabels: string[]
  averageLabel: string | null
  items: InspectItem[]
  tableHeaders: string[]
  texts: InspectTexts
}) {
  const uid = useId()
  const count = chart.columns.length
  const [selected, select] = useSelection(count, chart.defaultIndex)
  const { plot } = chart
  const item = items[selected]
  const patternId = (kind: string) => `${uid}-${kind}`

  return (
    <ChartCard title={title} summary={summary} legend={legend}>
      <SliderSvg
        width={chart.width}
        height={chart.height}
        plot={plot}
        slot={chart.slot}
        count={count}
        selected={selected}
        onSelect={select}
        label={title}
        text={valueText(item)}
      >
        <defs>
          <pattern id={patternId('hatch')} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} strokeWidth={2} className="stroke-chart-4" />
          </pattern>
          <pattern id={patternId('dots')} width={5} height={5} patternUnits="userSpaceOnUse">
            <circle cx={2.5} cy={2.5} r={1.2} className="fill-sage" />
          </pattern>
        </defs>

        {chart.yTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} className="stroke-border" strokeWidth={1} />
            <text x={plot.left - 6} y={tick.y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{tick.label}</text>
          </g>
        ))}

        {chart.columns.map((col) => {
          const isSelected = col.index === selected
          return (
            <g key={col.index} className={cn('motion-safe:transition-opacity', isSelected ? 'opacity-100' : 'opacity-60', col.partial && !isSelected && 'opacity-40')}>
              {col.segments.map((seg) => {
                const style = BAR_STYLES[styles[seg.series]]
                const rx = Math.min(3, col.barW / 2)
                return (
                  <g key={seg.series}>
                    <rect x={col.barX} y={seg.y} width={col.barW} height={seg.h} rx={rx} className={style.fill} />
                    {style.pattern && <rect x={col.barX} y={seg.y} width={col.barW} height={seg.h} rx={rx} fill={`url(#${patternId(style.pattern)})`} />}
                  </g>
                )
              })}
              {!col.logged && <circle cx={col.centerX} cy={chart.baselineY - 2} r={2} className="fill-muted-foreground" />}
              {col.partial && col.segments.length > 0 && (
                <rect
                  x={col.barX}
                  y={col.segments[col.segments.length - 1].y}
                  width={col.barW}
                  height={chart.baselineY - col.segments[col.segments.length - 1].y}
                  rx={Math.min(3, col.barW / 2)}
                  fill="none"
                  strokeDasharray="3 2"
                  strokeWidth={1}
                  className="stroke-foreground"
                />
              )}
            </g>
          )
        })}

        {chart.averageY !== null && (
          <g>
            <line x1={plot.left} x2={plot.right} y1={chart.averageY} y2={chart.averageY} strokeDasharray="4 3" strokeWidth={1} className="stroke-foreground/60" />
            {averageLabel && <text x={plot.right} y={chart.averageY - 3} textAnchor="end" className="fill-muted-foreground text-[11px]">{averageLabel}</text>}
          </g>
        )}

        {chart.columns.map((col) => col.showLabel && (
          <text key={col.index} x={col.centerX} y={plot.bottom + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">{axisLabels[col.index]}</text>
        ))}

        {/* Selection: thin guide line and a ring around the column. */}
        <line x1={chart.columns[selected].centerX} x2={chart.columns[selected].centerX} y1={plot.top} y2={plot.bottom} strokeWidth={1} className="stroke-border" />
        <rect
          x={chart.columns[selected].centerX - chart.slot / 2 + 0.5}
          y={plot.top}
          width={Math.max(chart.slot - 1, 1)}
          height={plot.bottom - plot.top}
          rx={3}
          fill="none"
          strokeWidth={2}
          className="stroke-ring"
        />
      </SliderSvg>

      <p className="text-xs text-muted-foreground">{texts.hint}</p>
      <ChartReadout item={item} selected={selected} count={count} onSelect={select} texts={texts} />
      <TableToggle items={items} headers={tableHeaders} texts={texts} />
    </ChartCard>
  )
}
