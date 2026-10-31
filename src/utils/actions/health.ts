'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { actionError } from './errors'
import { getRequestTimeZone } from '../care-timezone'
import {
  createGrowthMeasurementCore,
  createVaccinationCore,
  deleteGrowthMeasurementCore,
  deleteVaccinationCore,
  getHealthDataCore,
  updateGrowthMeasurementCore,
  updateVaccinationCore,
  upsertHealthProfileCore,
  type GrowthMeasurement,
  type HealthData,
  type HealthProfile,
  type Vaccination,
} from '../health-core'
import {
  HealthValidationError,
  type GrowthInput,
  type HealthProfileInput,
  type HealthResult,
  type VaccinationInput,
} from '../health-validation'

// Thin session wrappers: the logic and the health access check (admin for writes) live in
// health-core.ts so the MCP endpoint applies the same rules. Types are re-exported from
// there (type-only, allowed in a server action file).
export type { GrowthMeasurement, HealthData, HealthProfile, Vaccination }

async function requireUserId() {
  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthenticated')
  return user.id
}

// Expected failures come back as `{ ok: false, error }` because thrown Server Action
// messages are masked in production; the client translates the key. Auth failures and
// unexpected errors still throw.
async function toResult(fn: () => Promise<void>): Promise<HealthResult> {
  try {
    await fn()
    return { ok: true }
  } catch (err) {
    if (err instanceof HealthValidationError) return { ok: false, error: err.key }
    throw err
  }
}

export async function getHealthData(babyId: string): Promise<HealthData> {
  const userId = await requireUserId()
  return getHealthDataCore(await createClient(), userId, babyId, await getRequestTimeZone())
}

export async function saveHealthProfile(babyId: string, input: HealthProfileInput): Promise<HealthResult> {
  const userId = await requireUserId()
  const tz = await getRequestTimeZone()
  return toResult(async () => upsertHealthProfileCore(await createClient(), userId, babyId, input, tz))
}

export async function createGrowthMeasurement(babyId: string, input: GrowthInput): Promise<HealthResult> {
  const userId = await requireUserId()
  const tz = await getRequestTimeZone()
  return toResult(async () => createGrowthMeasurementCore(await createClient(), userId, babyId, input, tz))
}

export async function updateGrowthMeasurement(babyId: string, id: string, input: GrowthInput): Promise<HealthResult> {
  const userId = await requireUserId()
  const tz = await getRequestTimeZone()
  return toResult(async () => updateGrowthMeasurementCore(await createClient(), userId, babyId, id, input, tz))
}

export async function deleteGrowthMeasurement(babyId: string, id: string): Promise<HealthResult> {
  const userId = await requireUserId()
  return toResult(async () => deleteGrowthMeasurementCore(await createClient(), userId, babyId, id))
}

export async function createVaccination(babyId: string, input: VaccinationInput): Promise<HealthResult> {
  const userId = await requireUserId()
  const tz = await getRequestTimeZone()
  return toResult(async () => createVaccinationCore(await createClient(), userId, babyId, input, tz))
}

export async function updateVaccination(babyId: string, id: string, input: VaccinationInput): Promise<HealthResult> {
  const userId = await requireUserId()
  const tz = await getRequestTimeZone()
  return toResult(async () => updateVaccinationCore(await createClient(), userId, babyId, id, input, tz))
}

export async function deleteVaccination(babyId: string, id: string): Promise<HealthResult> {
  const userId = await requireUserId()
  return toResult(async () => deleteVaccinationCore(await createClient(), userId, babyId, id))
}
