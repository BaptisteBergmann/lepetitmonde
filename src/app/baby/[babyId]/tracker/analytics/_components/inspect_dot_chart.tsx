'use client'

import type { ReactNode } from 'react'
import type { DotChartBuild } from '@utils/care-analytics-chart'
import { cn } from '@utils/utils'
import type { DotStyle } from './chart_styles'
import { ChartCard, ChartReadout, SliderSvg, TableToggle, useSelection, valueText, type InspectItem, type InspectTexts } from './chart_readout'

// Dots with an optional line (longest stretch, median interval). Circle vs hollow
// square is the non-color cue between series.
export function InspectDotChart({
  title,
  summary,
  legend,
  chart,
  styles,
  axisLabels,
  items,
  tableHeaders,
  texts,
}: {
  title: string
  summary: string
  legend?: ReactNode
  chart: DotChartBuild
  styles: DotStyle[]
  axisLabels: string[]
  items: InspectItem[]
  tableHeaders: string[]
  texts: InspectTexts
}) {
  const count = chart.columns.length
  const [selected, select] = useSelection(count, chart.defaultIndex)
  const { plot } = chart
  const item = items[selected]

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
        {chart.yTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} className="stroke-border" strokeWidth={1} />
            <text x={plot.left - 6} y={tick.y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{tick.label}</text>
          </g>
        ))}

        {chart.columns.map((col) => col.showLabel && (
          <text key={col.index} x={col.centerX} y={plot.bottom + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">{axisLabels[col.index]}</text>
        ))}
        {chart.columns.map((col) => !col.logged && (
          <circle key={col.index} cx={col.centerX} cy={chart.baselineY - 2} r={2} className="fill-muted-foreground" />
        ))}

        <line x1={chart.columns[selected].centerX} x2={chart.columns[selected].centerX} y1={plot.top} y2={plot.bottom} strokeWidth={1} className="stroke-border" />

        {chart.series.map((series, si) => (
          <g key={si}>
            {series.line && <path d={series.line} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-foreground" />}
            {series.points.map((p) => {
              const isSelected = p.index === selected
              const partial = chart.columns[p.index].partial
              const common = cn('motion-safe:transition-opacity', isSelected ? 'opacity-100' : 'opacity-60', partial && 'opacity-40')
              return styles[si] === 'gap' ? (
                <rect key={p.index} x={p.x - 4} y={p.y - 4} width={8} height={8} fill="none" strokeWidth={2} className={cn('stroke-foreground', common)} strokeDasharray={partial ? '3 2' : undefined} />
              ) : (
                <circle
                  key={p.index}
                  cx={p.x}
                  cy={p.y}
                  r={4.5}
                  strokeWidth={2}
                  className={cn('stroke-landing-surface', styles[si] === 'median' ? 'fill-chart-1' : 'fill-chart-4', common)}
                />
              )
            })}
          </g>
        ))}

        {/* Ring around the selected column's points. */}
        {chart.series.flatMap((series, si) =>
          series.points.filter((p) => p.index === selected).map((p) => (
            <circle key={`${si}-${p.index}`} cx={p.x} cy={p.y} r={9} fill="none" strokeWidth={2} className="stroke-ring" />
          )),
        )}
      </SliderSvg>

      <p className="text-xs text-muted-foreground">{texts.hint}</p>
      <ChartReadout item={item} selected={selected} count={count} onSelect={select} texts={texts} />
      <TableToggle items={items} headers={tableHeaders} texts={texts} />
    </ChartCard>
  )
}
