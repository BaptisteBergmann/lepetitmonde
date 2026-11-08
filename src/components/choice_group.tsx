'use client'

import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@utils/utils'
import { CHOICE_ITEM_CLASS } from '@/components/toggle_choice'

export type ChoiceOption<T extends string> = { value: T; label: string; icon?: LucideIcon; swatch?: ReactNode }

// Segmented single-choice control (kind, side). A real radiogroup, so it gets
// arrow-key navigation; the checked option also shows a check, not only a tint.
const LAYOUT_CLASS = {
  row: 'grid auto-cols-fr grid-flow-col gap-2',
  grid: 'grid grid-cols-2 gap-2 sm:grid-cols-3',
  'grid-2': 'grid grid-cols-2 gap-2',
} as const

export function ChoiceGroup<T extends string>({
  value,
  onValueChange,
  options,
  label,
  size = 'md',
  layout = 'row',
  disabled,
}: {
  value: T | null
  onValueChange: (value: T) => void
  options: ChoiceOption<T>[]
  label: string
  size?: 'md' | 'lg'
  // 'grid' wraps into 2 columns (3 from sm), 'grid-2' stays at 2: for long labels and many options.
  layout?: 'row' | 'grid' | 'grid-2'
  disabled?: boolean
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      aria-label={label}
      disabled={disabled}
      className={LAYOUT_CLASS[layout]}
    >
      {options.map((option) => {
        const Icon = option.icon
        const checked = option.value === value
        return (
          <Radio.Root
            key={option.value}
            value={option.value}
            className={cn(
              CHOICE_ITEM_CLASS,
              size === 'lg' ? 'h-14' : 'h-12',
            )}
          >
            {option.swatch}
            {checked ? <Check className="size-4" aria-hidden="true" /> : Icon && <Icon className="size-4" aria-hidden="true" />}
            <span>{option.label}</span>
          </Radio.Root>
        )
      })}
    </RadioGroup>
  )
}
