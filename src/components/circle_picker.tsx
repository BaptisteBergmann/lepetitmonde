'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { descendantsOrSelf, orderAsTree, type CircleNode } from '@utils/circle-tree'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type PickerCircle = CircleNode & { name: string | null }

const INDENT_CLASS = ['pl-2', 'pl-6', 'pl-10']
const MAX_LISTED = 3

interface CirclePickerProps {
  circles: PickerCircle[]
  value: string[]
  onChange: (ids: string[]) => void
  placeholder: string
  disabled?: boolean
  id?: string
  // People who see what is shared with each circle (getCircleMemberCounts). Optional: when
  // given, each option shows its count and an empty circle gets a warning.
  audienceCounts?: Record<string, number>
}

// Hierarchical audience picker. Only what the user ticked is stored (the value); the
// sub-circles of a ticked circle are shown as "included" but derived on the fly, so a
// later move of a circle keeps the audience of existing content correct.
export function CirclePicker({ circles, value, onChange, placeholder, disabled, id, audienceCounts }: CirclePickerProps) {
  const t = useTranslations('circlePicker')
  const ordered = useMemo(() => orderAsTree(circles), [circles])
  const names = useMemo(() => Object.fromEntries(circles.map((c) => [c.id, c.name ?? ''])), [circles])
  const parentName = useMemo(() => new Map(circles.map((c) => [c.id, c.parent_circle ? names[c.parent_circle] : ''])), [circles, names])

  // Descendants of every explicitly ticked circle (the ticked circle itself excluded).
  const implied = useMemo(() => {
    const result = new Set<string>()
    for (const circleId of value) {
      for (const below of descendantsOrSelf([circleId], circles)) {
        if (below !== circleId) result.add(below)
      }
    }
    return result
  }, [value, circles])

  const explicit = new Set(value)
  const impliedOnly = Array.from(implied).filter((circleId) => !explicit.has(circleId))

  if (circles.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('noCircles')}</p>
  }

  const listHints = value
    .map((circleId) => {
      const below = Array.from(descendantsOrSelf([circleId], circles)).filter((x) => x !== circleId && !explicit.has(x))
      if (below.length === 0) return null
      const listed = below.slice(0, MAX_LISTED).map((x) => names[x]).join(', ')
      const list = below.length > MAX_LISTED ? `${listed}, ${t('andMore', { count: below.length - MAX_LISTED })}` : listed
      return t('includesList', { name: names[circleId], list })
    })
    .filter(Boolean)

  const emptyNames = audienceCounts ? value.filter((circleId) => audienceCounts[circleId] === 0).map((c) => names[c]) : []

  return (
    <>
      <Select
        items={names}
        multiple
        disabled={disabled}
        value={value}
        onValueChange={(next) => onChange(next as string[])}
      >
        <SelectTrigger id={id} className="w-full text-foreground bg-input/50 h-auto min-h-11">
          <SelectValue placeholder={placeholder}>
            {(selected: string[] | null) =>
              selected && selected.length > 0 ? (
                <span className="flex flex-wrap items-baseline gap-x-1.5 text-left whitespace-normal">
                  <span>{selected.map((circleId) => names[circleId]).join(', ')}</span>
                  {impliedOnly.length > 0 && (
                    <span className="text-xs text-muted-foreground">{t('includesSubCircles', { count: impliedOnly.length })}</span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {ordered.map((circle) => {
              const isImplied = implied.has(circle.id) && !explicit.has(circle.id)
              const level = circle.depth + 1
              const count = audienceCounts?.[circle.id]
              return (
                <SelectItem
                  key={circle.id}
                  value={circle.id}
                  className={`min-h-11 ${INDENT_CLASS[Math.min(circle.depth, 2)]}`}
                  aria-label={isImplied
                    ? t('optionLabelIncluded', { name: circle.name ?? '', level, parent: parentName.get(circle.id) ?? '' })
                    : t('optionLabel', { name: circle.name ?? '', level })}
                >
                  <span className="flex flex-1 items-center gap-2">
                    {isImplied && <Check className="size-4 text-muted-foreground" aria-hidden="true" />}
                    <span>{circle.name}</span>
                    {isImplied && <span className="text-xs text-muted-foreground">{t('included')}</span>}
                    {count !== undefined && (
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count}</span>
                    )}
                  </span>
                </SelectItem>
              )
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
      {listHints.length > 0 && <p className="text-xs text-muted-foreground">{listHints.join(' ')}</p>}
      {emptyNames.map((name) => (
        <p key={name} role="status" className="text-xs text-destructive">{t('emptyWarning', { name })}</p>
      ))}
    </>
  )
}
