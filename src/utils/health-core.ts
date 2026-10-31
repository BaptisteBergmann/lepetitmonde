// Deliberately NOT a 'use server' module: every function takes a userId and trusts it, so
// exporting them from an action file would make each one a publicly callable endpoint.
// They take the Supabase client as a parameter so the cookie-bound server actions (RLS as
// a second layer) and the MCP endpoint (service-role client, user id from a verified API
// token) apply one and the same rule. Every core re-checks health-page access, and writes
// additionally require the admin level. Only import from server code that has already
// authenticated the user.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { Enums, Tables } from '@utils/supabase/database.types'
import { logger } from './logger'
import { actionError } from './actions/errors'
import { assertPageAccessForUser } from './member-access'
import { getDisplayName } from './users'
import { todayInZone } from './care-time'
import {
  HEALTH_LIMITS,
  HealthValidationError,
  validateGrowthFields,
  validateProfileFields,
  validateVaccinationFields,
  type GrowthInput,
  type HealthProfileInput,
  type VaccinationInput,
} from './health-validation'
import {
  DEFAULT_VACCINE_SCHEDULE,
  getVaccineSchedule,
  isVaccineScheduleKey,
  type VaccineScheduleKey,
} from './vaccine-schedule'
import { computeVaccineStatus, type VaccineSchedule } from './vaccine-status'

export type HealthProfile = {
  birth_date: string | null
  sex: Tables<'baby_health_profiles'>['sex']
  vaccine_schedule: VaccineScheduleKey
}

export type GrowthMeasurement = Tables<'growth_measurements'> & { created_by_name: string | null }
export type Vaccination = Tables<'vaccinations'> & { created_by_name: string | null }

export type HealthData = {
  level: Enums<'role'>
  today: string
  profile: HealthProfile
  measurements: GrowthMeasurement[]
  vaccinations: Vaccination[]
}

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_LIST_LIMIT = 500

// Health page enabled for this baby and the member's level allowed by its role. Writes
// need the admin level on top, whatever the page role is (viewers can be given read access).
export async function assertHealthAccessForUser(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  opts: { write?: boolean } = {},
) {
  if (typeof babyId !== 'string' || !ID_RE.test(babyId)) throw await actionError('unauthorized')
  const level = await assertPageAccessForUser(supabase, userId, babyId, 'health')
  if (opts.write && level !== 'admin') throw await actionError('unauthorized')
  return level
}

function assertRowId(id: string) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new HealthValidationError('notFound')
}

function revalidateHealth(babyId: string) {
  revalidatePath(`/baby/${babyId}/health`)
}

// Creator names come from baby_access + users through the passed client; access was
// already checked by the caller.
async function withCreatorNames<T extends { created_by: string | null }>(
  supabase: SupabaseClient,
  babyId: string,
  rows: T[],
): Promise<(T & { created_by_name: string | null })[]> {
  const contextLogger = logger.child({ function: withCreatorNames.name, babyId })
  const { data, error } = await supabase
    .from('baby_access')
    .select('user_id, nickname, users (*)')
    .eq('baby_id', babyId)

  if (error) contextLogger.error(error, 'Error fetching creator names')

  type Member = { user_id: string; nickname: string | null; users: Tables<'users'> | Tables<'users'>[] | null }
  const names = new Map<string, string>()
  for (const row of (data ?? []) as unknown as Member[]) {
    const user = [row.users ?? []].flat()[0]
    if (user) names.set(row.user_id, getDisplayName(user, row.nickname))
  }
  return rows.map((row) => ({ ...row, created_by_name: row.created_by ? (names.get(row.created_by) || null) : null }))
}

async function loadProfile(supabase: SupabaseClient, babyId: string): Promise<HealthProfile> {
  const contextLogger = logger.child({ function: loadProfile.name, babyId })
  const { data, error } = await supabase
    .from('baby_health_profiles')
    .select('birth_date, sex, vaccine_schedule')
    .eq('baby_id', babyId)
    .maybeSingle()

  if (error) { contextLogger.error(error, 'Error fetching health profile'); throw error }
  return {
    birth_date: data?.birth_date ?? null,
    sex: data?.sex ?? null,
    vaccine_schedule: isVaccineScheduleKey(data?.vaccine_schedule) ? data.vaccine_schedule : DEFAULT_VACCINE_SCHEDULE,
  }
}

async function loadMeasurements(
  supabase: SupabaseClient,
  babyId: string,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<GrowthMeasurement[]> {
  const contextLogger = logger.child({ function: loadMeasurements.name, babyId })
  let query = supabase.from('growth_measurements').select('*').eq('baby_id', babyId)
  if (opts.from) query = query.gte('measured_on', opts.from)
  if (opts.to) query = query.lte('measured_on', opts.to)
  const { data, error } = await query
    .order('measured_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? DEFAULT_LIST_LIMIT)

  if (error) { contextLogger.error(error, 'Error fetching growth measurements'); throw error }
  contextLogger.debug({ count: data.length }, 'Growth measurements received')
  return withCreatorNames(supabase, babyId, data)
}

async function loadVaccinations(supabase: SupabaseClient, babyId: string): Promise<Vaccination[]> {
  const contextLogger = logger.child({ function: loadVaccinations.name, babyId })
  const { data, error } = await supabase
    .from('vaccinations')
    .select('*')
    .eq('baby_id', babyId)
    .order('given_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(DEFAULT_LIST_LIMIT)

  if (error) { contextLogger.error(error, 'Error fetching vaccinations'); throw error }
  contextLogger.debug({ count: data.length }, 'Vaccinations received')
  return withCreatorNames(supabase, babyId, data)
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getHealthProfileCore(supabase: SupabaseClient, userId: string, babyId: string): Promise<HealthProfile> {
  await assertHealthAccessForUser(supabase, userId, babyId)
  return loadProfile(supabase, babyId)
}

// Everything the page needs behind a single access check.
export async function getHealthDataCore(supabase: SupabaseClient, userId: string, babyId: string, tz: string): Promise<HealthData> {
  const level = await assertHealthAccessForUser(supabase, userId, babyId)
  const [profile, measurements, vaccinations] = await Promise.all([
    loadProfile(supabase, babyId),
    loadMeasurements(supabase, babyId),
    loadVaccinations(supabase, babyId),
  ])
  return { level, today: todayInZone(tz), profile, measurements, vaccinations }
}

export async function listGrowthMeasurementsCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<GrowthMeasurement[]> {
  await assertHealthAccessForUser(supabase, userId, babyId)
  return loadMeasurements(supabase, babyId, opts)
}

export async function listVaccinationsCore(supabase: SupabaseClient, userId: string, babyId: string): Promise<Vaccination[]> {
  await assertHealthAccessForUser(supabase, userId, babyId)
  return loadVaccinations(supabase, babyId)
}

export type UpcomingVaccines = {
  scheduleKey: VaccineScheduleKey
  scheduleId: string
  birthDate: string | null
  today: string
  status: VaccineSchedule<Vaccination>
}

export async function getUpcomingVaccinesCore(supabase: SupabaseClient, userId: string, babyId: string, tz: string): Promise<UpcomingVaccines> {
  await assertHealthAccessForUser(supabase, userId, babyId)
  const [profile, shots] = await Promise.all([loadProfile(supabase, babyId), loadVaccinations(supabase, babyId)])
  const today = todayInZone(tz)
  const scheduleKey = profile.vaccine_schedule
  return {
    scheduleKey,
    scheduleId: getVaccineSchedule(scheduleKey).id,
    birthDate: profile.birth_date,
    today,
    status: computeVaccineStatus(scheduleKey, profile.birth_date, today, shots),
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

// Two steps on purpose: a plain .upsert() makes PostgREST put baby_id in the
// ON CONFLICT DO UPDATE SET list, and `authenticated` has no UPDATE on baby_id (42501).
// Step 1 only creates the row when missing; step 2 updates just the supplied columns, so a
// partial call (e.g. only a birth date) never overwrites a saved sex or schedule.
export async function upsertHealthProfileCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  input: HealthProfileInput,
  tz: string,
): Promise<void> {
  const contextLogger = logger.child({ function: upsertHealthProfileCore.name, babyId })
  await assertHealthAccessForUser(supabase, userId, babyId, { write: true })
  const patch = validateProfileFields(input, todayInZone(tz))

  const { error: insertError } = await supabase
    .from('baby_health_profiles')
    .upsert({ baby_id: babyId, updated_by: userId }, { onConflict: 'baby_id', ignoreDuplicates: true })
  if (insertError) { contextLogger.error(insertError, 'Error creating health profile'); throw insertError }

  const { error } = await supabase
    .from('baby_health_profiles')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('baby_id', babyId)
  if (error) { contextLogger.error(error, 'Error updating health profile'); throw error }

  contextLogger.info({ fields: Object.keys(patch) }, 'Health profile saved')
  revalidateHealth(babyId)
}

// ---------------------------------------------------------------------------
// Growth measurements
// ---------------------------------------------------------------------------

export async function createGrowthMeasurementCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  input: GrowthInput,
  tz: string,
): Promise<void> {
  const contextLogger = logger.child({ function: createGrowthMeasurementCore.name, babyId })
  await assertHealthAccessForUser(supabase, userId, babyId, { write: true })
  const profile = await loadProfile(supabase, babyId)
  const fields = validateGrowthFields(input, { today: todayInZone(tz), birthDate: profile.birth_date })

  const { error } = await supabase
    .from('growth_measurements')
    .insert({ ...fields, baby_id: babyId, created_by: userId })
  if (error) { contextLogger.error(error, 'Error creating growth measurement'); throw error }

  contextLogger.info('Growth measurement created')
  revalidateHealth(babyId)
}

export async function updateGrowthMeasurementCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  id: string,
  input: GrowthInput,
  tz: string,
): Promise<void> {
  const contextLogger = logger.child({ function: updateGrowthMeasurementCore.name, babyId, id })
  await assertHealthAccessForUser(supabase, userId, babyId, { write: true })
  assertRowId(id)
  const profile = await loadProfile(supabase, babyId)
  const fields = validateGrowthFields(input, { today: todayInZone(tz), birthDate: profile.birth_date })

  // Column-level UPDATE grant: never send id, baby_id, created_by or created_at. The baby_id
  // filter makes an id from another baby match nothing.
  const { data, error } = await supabase
    .from('growth_measurements')
    .update({ ...fields, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
    .eq('baby_id', babyId)
    .select('id')
    .maybeSingle()
  if (error) { contextLogger.error(error, 'Error updating growth measurement'); throw error }
  if (!data) { revalidateHealth(babyId); throw new HealthValidationError('notFound') }

  contextLogger.info('Growth measurement updated')
  revalidateHealth(babyId)
}

export async function deleteGrowthMeasurementCore(supabase: SupabaseClient, userId: string, babyId: string, id: string): Promise<void> {
  const contextLogger = logger.child({ function: deleteGrowthMeasurementCore.name, babyId, id })
  await assertHealthAccessForUser(supabase, userId, babyId, { write: true })
  assertRowId(id)

  const { data, error } = await supabase
    .from('growth_measurements')
    .delete()
    .eq('id', id)
    .eq('baby_id', babyId)
    .select('id')
    .maybeSingle()
  if (error) { contextLogger.error(error, 'Error deleting growth measurement'); throw error }
  if (!data) { revalidateHealth(babyId); throw new HealthValidationError('notFound') }

  contextLogger.info('Growth measurement deleted')
  revalidateHealth(babyId)
}

// ---------------------------------------------------------------------------
// Vaccinations
// ---------------------------------------------------------------------------

export async function createVaccinationCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  input: VaccinationInput,
  tz: string,
): Promise<void> {
  const contextLogger = logger.child({ function: createVaccinationCore.name, babyId })
  await assertHealthAccessForUser(supabase, userId, babyId, { write: true })
  const profile = await loadProfile(supabase, babyId)
  const fields = validateVaccinationFields(input, { today: todayInZone(tz), birthDate: profile.birth_date })

  // Omitted dose = the next one: the highest dose recorded for this vaccine, plus one (a
  // count would reuse a number when an earlier dose was never recorded).
  let dose = fields.dose_number
  if (dose === null && fields.vaccine_code !== 'other' && (input.doseNumber === undefined || input.doseNumber === null)) {
    const { data: last, error: lastError } = await supabase
      .from('vaccinations')
      .select('dose_number')
      .eq('baby_id', babyId)
      .eq('vaccine_code', fields.vaccine_code)
      .not('dose_number', 'is', null)
      .order('dose_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastError) { contextLogger.error({ code: lastError.code, message: lastError.message }, 'Error finding last dose'); throw lastError }
    const next = ((last?.dose_number as number | null | undefined) ?? 0) + 1
    if (next > HEALTH_LIMITS.doseMax) throw new HealthValidationError('invalidDose')
    dose = next
  }

  const { error } = await supabase
    .from('vaccinations')
    .insert({ ...fields, dose_number: dose, baby_id: babyId, created_by: userId })
  if (error) {
    // Unique index on (baby, vaccine, dose): a double tap or a duplicate call.
    if (error.code === '23505') {
      contextLogger.info('Duplicate vaccine dose')
      revalidateHealth(babyId)
      throw new HealthValidationError('duplicateDose')
    }
    contextLogger.error(error, 'Error creating vaccination')
    throw error
  }

  contextLogger.info('Vaccination created')
  revalidateHealth(babyId)
}

export async function updateVaccinationCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  id: string,
  input: VaccinationInput,
  tz: string,
): Promise<void> {
  const contextLogger = logger.child({ function: updateVaccinationCore.name, babyId, id })
  await assertHealthAccessForUser(supabase, userId, babyId, { write: true })
  assertRowId(id)
  const profile = await loadProfile(supabase, babyId)
  const fields = validateVaccinationFields(input, { today: todayInZone(tz), birthDate: profile.birth_date })

  const { data, error } = await supabase
    .from('vaccinations')
    .update({ ...fields, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
    .eq('baby_id', babyId)
    .select('id')
    .maybeSingle()
  if (error) {
    if (error.code === '23505') { revalidateHealth(babyId); throw new HealthValidationError('duplicateDose') }
    contextLogger.error(error, 'Error updating vaccination')
    throw error
  }
  if (!data) { revalidateHealth(babyId); throw new HealthValidationError('notFound') }

  contextLogger.info('Vaccination updated')
  revalidateHealth(babyId)
}

export async function deleteVaccinationCore(supabase: SupabaseClient, userId: string, babyId: string, id: string): Promise<void> {
  const contextLogger = logger.child({ function: deleteVaccinationCore.name, babyId, id })
  await assertHealthAccessForUser(supabase, userId, babyId, { write: true })
  assertRowId(id)

  const { data, error } = await supabase
    .from('vaccinations')
    .delete()
    .eq('id', id)
    .eq('baby_id', babyId)
    .select('id')
    .maybeSingle()
  if (error) { contextLogger.error(error, 'Error deleting vaccination'); throw error }
  if (!data) { revalidateHealth(babyId); throw new HealthValidationError('notFound') }

  contextLogger.info('Vaccination deleted')
  revalidateHealth(babyId)
}
