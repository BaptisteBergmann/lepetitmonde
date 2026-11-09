// Server-side input validation for the tracker's Server Actions. Not a
// 'use server' module; it mirrors the SQL CHECKs on care_events so users get
// a readable error instead of a raw 23514. Failures throw CareValidationError with a
// stable key; the actions turn it into a `{ ok: false, error }` result and the client
// translates it (thrown Server Action messages are masked in production).
import {
  CARE_KIND_CONFIG,
  CARE_LIMITS,
  isBreastSide,
  isCareKind,
  isPoopColor,
  isPoopTexture,
  type BreastSide,
  type CareKind,
  type PoopColor,
  type PoopTexture,
} from '@utils/care-events'

export type CareErrorKey =
  | 'notFound'
  | 'conflict'
  | 'alreadyRunning'
  | 'alreadyStopped'
  | 'future'
  | 'invalidTime'
  | 'endBeforeStart'
  | 'tooLong'
  | 'invalidAmount'
  | 'invalidSide'
  | 'invalidKind'
  | 'invalidDiaper'
  | 'noteTooLong'

export class CareValidationError extends Error {
  constructor(readonly key: CareErrorKey) {
    super(key)
  }
}

export type CareResult = { ok: true } | { ok: false; error: CareErrorKey }

export type CareEventInput = {
  // Client-generated row id (UUID) so an offline replay is idempotent. Omitted: the DB assigns one.
  id?: string
  kind: CareKind
  // Optional on create (defaults to the server's now); required on update.
  startedAt?: string
  endedAt?: string | null
  side?: BreastSide | null
  amountMl?: number | null
  pee?: boolean | null
  poop?: boolean | null
  poopColor?: PoopColor | null
  poopTexture?: PoopTexture | null
  note?: string | null
}

export type ValidatedCareFields = {
  kind: CareKind
  started_at: string
  // undefined = leave the stored value unchanged (updates only)
  ended_at: string | null | undefined
  breast_side: BreastSide | null
  amount_ml: number | null
  pee: boolean | null
  poop: boolean | null
  poop_color: PoopColor | null
  poop_texture: PoopTexture | null
  note: string | null
}

export async function parseTimestamp(value: unknown): Promise<Date> {
  if (typeof value !== 'string' || value.length > 40) throw new CareValidationError('invalidTime')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new CareValidationError('invalidTime')
  return date
}

export async function assertNotInFuture(date: Date, now: Date) {
  if (date.getTime() > now.getTime() + CARE_LIMITS.futureToleranceMs) throw new CareValidationError('future')
}

export async function assertSide(value: unknown): Promise<BreastSide> {
  if (!isBreastSide(value)) throw new CareValidationError('invalidSide')
  return value
}

export async function assertKind(value: unknown): Promise<CareKind> {
  if (!isCareKind(value)) throw new CareValidationError('invalidKind')
  return value
}

async function assertAmount(value: unknown): Promise<number | null> {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < CARE_LIMITS.amountMin || value > CARE_LIMITS.amountMax) {
    throw new CareValidationError('invalidAmount')
  }
  return value
}

// Mirrors care_events_diaper_fields: at least one of pee/poop, and colour and
// texture only describe poop. Missing flags count as false.
async function assertDiaper(input: Partial<CareEventInput>) {
  const flag = (value: unknown) => {
    if (value === undefined || value === null) return false
    if (typeof value !== 'boolean') throw new CareValidationError('invalidDiaper')
    return value
  }
  const pee = flag(input.pee)
  const poop = flag(input.poop)
  if (!pee && !poop) throw new CareValidationError('invalidDiaper')

  const color = input.poopColor ?? null
  const texture = input.poopTexture ?? null
  if (color !== null && !isPoopColor(color)) throw new CareValidationError('invalidDiaper')
  if (texture !== null && !isPoopTexture(texture)) throw new CareValidationError('invalidDiaper')
  if (!poop && (color !== null || texture !== null)) throw new CareValidationError('invalidDiaper')
  return { pee, poop, poop_color: color, poop_texture: texture }
}

async function normalizeNote(value: unknown): Promise<string | null> {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new CareValidationError('noteTooLong')
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > CARE_LIMITS.noteMax) throw new CareValidationError('noteTooLong')
  return trimmed
}

// `kind` is passed separately so updates can pin it to the stored value.
// `ongoing` entries never touch ended_at (they're stopped with stopCareTimer).
// `isUpdate`: an omitted startedAt is an error and an omitted endedAt keeps the
// stored end; on create, startedAt defaults to now and a missing end means none.
export async function validateCareFields(
  input: Partial<CareEventInput> | null | undefined,
  kind: CareKind,
  options: { ongoing?: boolean; isUpdate?: boolean; now?: Date } = {},
): Promise<ValidatedCareFields> {
  if (!input || typeof input !== 'object') throw new CareValidationError('invalidTime')
  const now = options.now ?? new Date()
  const config = CARE_KIND_CONFIG[kind]

  const started = input.startedAt === undefined && !options.isUpdate ? now : await parseTimestamp(input.startedAt)
  await assertNotInFuture(started, now)

  let ended_at: string | null | undefined = null
  if (!config.timed) {
    ended_at = null
  } else if (options.ongoing) {
    ended_at = undefined
  } else if (input.endedAt === undefined && options.isUpdate) {
    ended_at = undefined
  } else if (input.endedAt !== null && input.endedAt !== undefined && input.endedAt !== '') {
    const ended = await parseTimestamp(input.endedAt)
    if (ended.getTime() < started.getTime()) throw new CareValidationError('endBeforeStart')
    if (ended.getTime() - started.getTime() > CARE_LIMITS.maxDurationMs) throw new CareValidationError('tooLong')
    await assertNotInFuture(ended, now)
    ended_at = ended.toISOString()
  }

  const breast_side = config.fields.includes('side') ? await assertSide(input.side) : null
  const amount_ml = config.fields.includes('amount') ? await assertAmount(input.amountMl) : null
  const diaper = config.fields.includes('diaper')
    ? await assertDiaper(input)
    : { pee: null, poop: null, poop_color: null, poop_texture: null }
  const note = await normalizeNote(input.note)

  return { kind, started_at: started.toISOString(), ended_at, breast_side, amount_ml, ...diaper, note }
}
