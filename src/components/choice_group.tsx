'use client'

import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@utils/utils'

export type ChoiceOption<T extends string> = { value: T; label: string; icon?: LucideIcon }

// Segmented single-choice control (kind, side). A real radiogroup, so it gets
// arrow-key navigation; the checked option also shows a check, not only a tint.
export function ChoiceGroup<T extends string>({
  value,
  onValueChange,
  options,
  label,
  size = 'md',
  disabled,
}: {
  value: T | null
  onValueChange: (value: T) => void
  options: ChoiceOption<T>[]
  label: string
  size?: 'md' | 'lg'
  disabled?: boolean
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      aria-label={label}
      disabled={disabled}
      className="grid auto-cols-fr grid-flow-col gap-2"
    >
      {options.map((option) => {
        const Icon = option.icon
        const checked = option.value === value
        return (
          <Radio.Root
            key={option.value}
            value={option.value}
            className={cn(
              'flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-border bg-input/50 px-2 text-sm font-medium outline-none transition-colors',
              'focus-visible:ring-3 focus-visible:ring-ring/30 data-[checked]:border-primary data-[checked]:bg-primary/15 data-[checked]:text-landing-foreground',
              'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
              size === 'lg' ? 'h-14' : 'h-12',
            )}
          >
            {checked ? <Check className="size-4" aria-hidden="true" /> : Icon && <Icon className="size-4" aria-hidden="true" />}
            <span>{option.label}</span>
          </Radio.Root>
        )
      })}
    </RadioGroup>
  )
}
