'use client'

import { Toggle } from '@base-ui/react/toggle'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@utils/utils'

// Shared look of a selectable option (ChoiceGroup radios and ToggleChoice buttons).
// Both state attributes are listed because Radio exposes `checked` and Toggle `pressed`.
export const CHOICE_ITEM_CLASS = cn(
  'flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-border bg-input/50 px-2 text-sm font-medium outline-none transition-colors',
  'focus-visible:ring-3 focus-visible:ring-ring/30',
  'data-[checked]:border-primary data-[checked]:bg-primary/15 data-[checked]:text-landing-foreground',
  'data-[pressed]:border-primary data-[pressed]:bg-primary/15 data-[pressed]:text-landing-foreground',
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
)

// Multi-select group of toggle buttons (a radiogroup can't express "pee and poop").
export function ToggleChoiceGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('grid auto-cols-fr grid-flow-col gap-2', className)}>
      {children}
    </div>
  )
}

// On-state shows a check as well as the tint, so it is not colour-only.
export function ToggleChoice({
  pressed,
  onPressedChange,
  disabled,
  children,
}: {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Toggle pressed={pressed} onPressedChange={onPressedChange} disabled={disabled} className={cn(CHOICE_ITEM_CLASS, 'h-12')}>
      {pressed && <Check className="size-4" aria-hidden="true" />}
      <span>{children}</span>
    </Toggle>
  )
}
