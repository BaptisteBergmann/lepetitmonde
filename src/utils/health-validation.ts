// Server-side input validation for the health cores. Not a 'use server' module; it
// mirrors the SQL CHECKs on the health tables so users get a readable error instead of a
// raw 23514. Failures throw HealthValidationError with a stable key; the actions turn it
// into a `{ ok: false, error }` result and the client translates it (thrown Server Action
// messages are masked in production).
import { z } from 'zod'
import { isValidDay } from '@utils/care-time'
import {
  VACCINE_SCHEDULE_KEYS,
  isVaccineCode,
  type VaccineCode,
  type VaccineScheduleKey,
} from '@utils/vaccine-schedule'

export type HealthErrorKey =
  | 'notFound'
  | 'invalidDate'
  | 'future'
  | 'beforeBirth'
  | 'noMeasurement'
  | 'invalidWeight'
  | 'invalidLength'
  | 'invalidHead'
  | 'invalidVaccine'
  | 'labelRequired'
  | 'invalidDose'
  | 'duplicateDose'
  | 'noteTooLong'
  | 'missingBirthDate'
  | 'missingSex'
  | 'invalidSex'
  | 'invalidSchedule'

export class HealthValidationError extends Error {
  constructor(readonly key: HealthErrorKey) {
    super(key)
  }
}

export type HealthResult = { ok: true } | { ok: false; error: HealthErrorKey }

// Mirrors the SQL CHECKs (weight_g, length_mm, head_circumference_mm, ...).
export const HEALTH_LIMITS = {
  weightGMin: 300,
  weightGMax: 40_000,
  lengthMmMin: 200,
  lengthMmMax: 1_400,
  headMmMin: 200,
  headMmMax: 650,
  noteMax: 500,
  labelMax: 100,
  doseMin: 1,
  doseMax: 10,
  birthDateMin: '2000-01-01',
} as const

export type HealthSex = 'female' | 'male'

const scheduleSchema = z.enum(VACCINE_SCHEDULE_KEYS)

export type HealthProfileInput = {
  birthDate?: string | null
  sex?: HealthSex | null
  vaccineSchedule?: VaccineScheduleKey
}

// Only the fields the caller supplied: a partial update (e.g. MCP set_health_profile with
// just a birth date) must not overwrite the others.
export type ValidatedProfilePatch = {
  birth_date?: string | null
  sex?: HealthSex | null
  vaccine_schedule?: VaccineScheduleKey
}

export type GrowthInput = {
  measuredOn?: string
  weightKg?: number | null
  lengthCm?: number | null
  headCircumferenceCm?: number | null
  note?: string | null
}

export type ValidatedGrowthFields = {
  measured_on: string
  weight_g: number | null
  length_mm: number | null
  head_circumference_mm: number | null
  note: string | null
}

export type VaccinationInput = {
  vaccineCode: string
  vaccineLabel?: string | null
  // Omitted on create = next dose, assigned by the core.
  doseNumber?: number | null
  givenOn?: string
  note?: string | null
}

export type ValidatedVaccinationFields = {
  vaccine_code: VaccineCode
  vaccine_label: string | null
  dose_number: number | null
  given_on: string
  note: string | null
}

export function assertDay(value: unknown): string {
  if (typeof value !== 'string' || !isValidDay(value)) throw new HealthValidationError('invalidDate')
  return value
}

// yyyy-MM-dd strings compare correctly as text.
function assertDateBounds(day: string, today: string, birthDate: string | null) {
  if (day > today) throw new HealthValidationError('future')
  if (birthDate && day < birthDate) throw new HealthValidationError('beforeBirth')
}

function normalizeNote(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new HealthValidationError('noteTooLong')
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > HEALTH_LIMITS.noteMax) throw new HealthValidationError('noteTooLong')
  return trimmed
}

// value in the display unit -> integer sub-unit, or null when omitted.
function toSubUnit(
  value: unknown,
  factor: number,
  min: number,
  max: number,
  error: HealthErrorKey,
): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new HealthValidationError(error)
  const scaled = Math.round(value * factor)
  if (scaled < min || scaled > max) throw new HealthValidationError(error)
  return scaled
}

export function validateProfileFields(
  input: HealthProfileInput | null | undefined,
  today: string,
): ValidatedProfilePatch {
  if (!input || typeof input !== 'object') throw new HealthValidationError('invalidDate')
  const patch: ValidatedProfilePatch = {}

  if (input.birthDate !== undefined) {
    if (input.birthDate === null) {
      patch.birth_date = null
    } else {
      const day = assertDay(input.birthDate)
      if (day < HEALTH_LIMITS.birthDateMin) throw new HealthValidationError('invalidDate')
      if (day > today) throw new HealthValidationError('future')
      patch.birth_date = day
    }
  }

  if (input.sex !== undefined) {
    if (input.sex !== null && input.sex !== 'female' && input.sex !== 'male') {
      throw new HealthValidationError('invalidSex')
    }
    patch.sex = input.sex
  }

  // Never null: the column is NOT NULL, so null or an unknown value is an error.
  if (input.vaccineSchedule !== undefined) {
    const parsed = scheduleSchema.safeParse(input.vaccineSchedule)
    if (!parsed.success) throw new HealthValidationError('invalidSchedule')
    patch.vaccine_schedule = parsed.data
  }

  return patch
}

export function validateGrowthFields(
  input: GrowthInput | null | undefined,
  ctx: { today: string; birthDate: string | null },
): ValidatedGrowthFields {
  if (!input || typeof input !== 'object') throw new HealthValidationError('invalidDate')
  const measured_on = input.measuredOn === undefined ? ctx.today : assertDay(input.measuredOn)
  assertDateBounds(measured_on, ctx.today, ctx.birthDate)

  const weight_g = toSubUnit(input.weightKg, 1000, HEALTH_LIMITS.weightGMin, HEALTH_LIMITS.weightGMax, 'invalidWeight')
  const length_mm = toSubUnit(input.lengthCm, 10, HEALTH_LIMITS.lengthMmMin, HEALTH_LIMITS.lengthMmMax, 'invalidLength')
  const head_circumference_mm = toSubUnit(input.headCircumferenceCm, 10, HEALTH_LIMITS.headMmMin, HEALTH_LIMITS.headMmMax, 'invalidHead')
  if (weight_g === null && length_mm === null && head_circumference_mm === null) {
    throw new HealthValidationError('noMeasurement')
  }

  return { measured_on, weight_g, length_mm, head_circumference_mm, note: normalizeNote(input.note) }
}

export function validateVaccinationFields(
  input: VaccinationInput | null | undefined,
  ctx: { today: string; birthDate: string | null },
): ValidatedVaccinationFields {
  if (!input || typeof input !== 'object') throw new HealthValidationError('invalidVaccine')
  if (!isVaccineCode(input.vaccineCode)) throw new HealthValidationError('invalidVaccine')
  const vaccine_code = input.vaccineCode

  let vaccine_label: string | null = null
  if (vaccine_code === 'other') {
    const label = typeof input.vaccineLabel === 'string' ? input.vaccineLabel.trim() : ''
    if (!label || label.length > HEALTH_LIMITS.labelMax) throw new HealthValidationError('labelRequired')
    vaccine_label = label
  }

  let dose_number: number | null = null
  if (input.doseNumber !== undefined && input.doseNumber !== null) {
    const dose = input.doseNumber
    if (!Number.isInteger(dose) || dose < HEALTH_LIMITS.doseMin || dose > HEALTH_LIMITS.doseMax) {
      throw new HealthValidationError('invalidDose')
    }
    // "Other" has no dose bookkeeping (the unique index skips it).
    dose_number = vaccine_code === 'other' ? null : dose
  }

  const given_on = input.givenOn === undefined ? ctx.today : assertDay(input.givenOn)
  assertDateBounds(given_on, ctx.today, ctx.birthDate)

  return { vaccine_code, vaccine_label, dose_number, given_on, note: normalizeNote(input.note) }
}
