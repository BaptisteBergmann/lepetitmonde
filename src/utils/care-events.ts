import { HandHeart, Milk, Moon, type LucideIcon } from 'lucide-react'
import type { Enums } from '@utils/supabase/database.types'

// Client-safe constants for the tracker (no server-only imports).
//
// Adding a kind later:
// 1. Migration A: ALTER TYPE care_event_kind ADD VALUE '<kind>'. Keep it in its own
//    migration file: a new enum value can't be used in the transaction that adds it.
// 2. Migration B: add nullable typed columns for the kind's fields plus a
//    care_events_<kind>_fields CHECK, and update the other kinds' CHECKs if the new
//    columns must be null for them.
// 3. Regenerate types, add the kind to CARE_KINDS and CARE_KIND_CONFIG below, then add
//    form fields, a describe case in the log row and the messages (tracker.kinds.*).

export type CareKind = Enums<'care_event_kind'>
export type BreastSide = Enums<'breast_side'>

export const CARE_KINDS: readonly CareKind[] = ['sleep', 'breastfeed', 'bottle']
export const BREAST_SIDES: readonly BreastSide[] = ['left', 'both', 'right']

// Kinds that can run as a start/stop timer.
export const TIMER_KINDS = ['sleep', 'breastfeed'] as const satisfies readonly CareKind[]
export type TimerKind = (typeof TIMER_KINDS)[number]

export const FEED_KINDS: readonly CareKind[] = ['breastfeed', 'bottle']

export type QuickAction = 'timer' | 'side-timer' | 'amount'
export type FormField = 'side' | 'amount' | 'note'

export interface CareKindConfig {
  icon: LucideIcon
  // Maps to the icon badge classes in the design (existing theme tokens only).
  tone: 'chart-4' | 'rose' | 'sage'
  // Has a start and an optional end (shows the End field and a duration).
  timed: boolean
  quick: QuickAction
  fields: FormField[]
}

export const CARE_KIND_CONFIG: Record<CareKind, CareKindConfig> = {
  sleep: { icon: Moon, tone: 'chart-4', timed: true, quick: 'timer', fields: ['note'] },
  breastfeed: { icon: HandHeart, tone: 'rose', timed: true, quick: 'side-timer', fields: ['side', 'note'] },
  bottle: { icon: Milk, tone: 'sage', timed: false, quick: 'amount', fields: ['amount', 'note'] },
}

// Full class strings so Tailwind can see them.
export const CARE_TONE_CLASSES: Record<CareKindConfig['tone'], string> = {
  'chart-4': 'bg-chart-4/15 text-chart-4',
  rose: 'bg-rose/15 text-rose',
  sage: 'bg-sage/15 text-sage',
}

export const CARE_LIMITS = {
  noteMax: 500,
  amountMin: 1,
  amountMax: 1000,
  bottleStep: 10,
  bottleDefault: 90,
  maxDurationMs: 24 * 60 * 60 * 1000,
  futureToleranceMs: 5 * 60 * 1000,
  // Running longer than this gets a warning in the UI.
  staleTimerMs: 12 * 60 * 60 * 1000,
} as const

export function isCareKind(value: unknown): value is CareKind {
  return typeof value === 'string' && (CARE_KINDS as readonly string[]).includes(value)
}

export function isBreastSide(value: unknown): value is BreastSide {
  return typeof value === 'string' && (BREAST_SIDES as readonly string[]).includes(value)
}
