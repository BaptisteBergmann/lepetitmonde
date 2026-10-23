// Server-side input validation for the tracker's Server Actions. Not a
// 'use server' module; it mirrors the SQL CHECKs on care_events so users get
// a readable, translated error instead of a raw 23514.
import { actionError } from '@utils/actions/errors'
import { normalizeText } from '@utils/feed-validation'
import {
  CARE_KIND_CONFIG,
  CARE_LIMITS,
  isBreastSide,
  isCareKind,
  type BreastSide,
  type CareKind,
} from '@utils/care-events'

export type CareEventInput = {
  kind: CareKind
  startedAt: string
  endedAt?: string | null
  side?: BreastSide | null
  amountMl?: number | null
  note?: string | null
}

export type ValidatedCareFields = {
  kind: CareKind
  started_at: string
  ended_at: string | null
  breast_side: BreastSide | null
  amount_ml: number | null
  note: string | null
}

export async function parseTimestamp(value: unknown): Promise<Date> {
  if (typeof value !== 'string' || value.length > 40) throw await actionError('careInvalidTime')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw await actionError('careInvalidTime')
  return date
}

export async function assertNotInFuture(date: Date, now: Date) {
  if (date.getTime() > now.getTime() + CARE_LIMITS.futureToleranceMs) throw await actionError('careInFuture')
}

export async function assertSide(value: unknown): Promise<BreastSide> {
  if (!isBreastSide(value)) throw await actionError('careInvalidSide')
  return value
}

export async function assertKind(value: unknown): Promise<CareKind> {
  if (!isCareKind(value)) throw await actionError('careInvalidKind')
  return value
}

async function assertAmount(value: unknown): Promise<number | null> {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < CARE_LIMITS.amountMin || value > CARE_LIMITS.amountMax) {
    throw await actionError('careInvalidAmount')
  }
  return value
}

// `ongoing` entries ignore endedAt (they're stopped with stopCareTimer).
// `kind` is passed separately so updates can pin it to the stored value.
export async function validateCareFields(
  input: Partial<CareEventInput> | null | undefined,
  kind: CareKind,
  options: { ongoing?: boolean; now?: Date } = {},
): Promise<ValidatedCareFields> {
  if (!input || typeof input !== 'object') throw await actionError('careInvalidTime')
  const now = options.now ?? new Date()
  const config = CARE_KIND_CONFIG[kind]

  const started = await parseTimestamp(input.startedAt)
  await assertNotInFuture(started, now)

  let ended_at: string | null = null
  // Untimed kinds (bottle) never carry an end, mirroring the SQL CHECK.
  if (config.timed && !options.ongoing && input.endedAt !== null && input.endedAt !== undefined && input.endedAt !== '') {
    const ended = await parseTimestamp(input.endedAt)
    if (ended.getTime() < started.getTime()) throw await actionError('careEndBeforeStart')
    if (ended.getTime() - started.getTime() > CARE_LIMITS.maxDurationMs) throw await actionError('careTooLong')
    await assertNotInFuture(ended, now)
    ended_at = ended.toISOString()
  }

  const breast_side = config.fields.includes('side') ? await assertSide(input.side) : null
  const amount_ml = config.fields.includes('amount') ? await assertAmount(input.amountMl) : null
  const note = await normalizeText(input.note, CARE_LIMITS.noteMax)

  return { kind, started_at: started.toISOString(), ended_at, breast_side, amount_ml, note }
}
