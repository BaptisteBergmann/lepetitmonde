import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { FAMILY_TIME_ZONE } from '@utils/formatting'
import { todayInZone } from '@utils/care-time'
import {
  createGrowthMeasurementCore,
  createVaccinationCore,
  deleteGrowthMeasurementCore,
  deleteVaccinationCore,
  getHealthProfileCore,
  getUpcomingVaccinesCore,
  listGrowthMeasurementsCore,
  listVaccinationsCore,
  upsertHealthProfileCore,
  type GrowthMeasurement,
  type HealthProfile,
  type Vaccination,
} from '@utils/health-core'
import { ageInDays, evaluateMeasurement, type GrowthIndicator } from '@utils/growth-who'
import { HEALTH_LIMITS, HealthValidationError } from '@utils/health-validation'
import { VACCINE_CODES, VACCINE_SCHEDULE_KEYS } from '@utils/vaccine-schedule'
import { addMonthsToDay } from '@utils/vaccine-status'
import { babyId, day, run, timeZone, type ToolContext } from './shared'

const vaccineCode = z.enum(VACCINE_CODES).describe(
  'Vaccine code. dtcap_hib_hepb = hexavalent / DTCaP-Hib-HepB; dtcap_hib = DCaT-VPI-Hib (no hepatitis B); pcv = pneumocoque / pneumococcal; ' +
    'rotavirus; menb = méningocoque B; menacwy = méningocoque ACWY; menc = méningocoque C; mmr = ROR (rougeole-oreillons-rubéole); ' +
    'mmrv = RRO-Var (with varicella); dtcap = DTCaP / DCaT-VPI booster at 4-6 years; hepa_hepb = hépatite A+B; hepa = hépatite A; hepb = hépatite B; ' +
    'bcg; varicella = varicelle; influenza = grippe; covid; nirsevimab = Beyfortus (RSV); other = anything else (needs vaccineLabel).',
)

const round1 = (n: number) => Math.round(n * 10) / 10

function ageOf(profile: HealthProfile, date: string) {
  if (!profile.birth_date) return null
  const days = ageInDays(profile.birth_date, date)
  if (days < 0) return null
  return { days, months: round1(days / 30.4375) }
}

function percentiles(profile: HealthProfile, m: GrowthMeasurement) {
  const percentile = (indicator: GrowthIndicator, value: number | null) => {
    if (value === null || !profile.birth_date || !profile.sex) return null
    return evaluateMeasurement(indicator, profile.sex, profile.birth_date, m.measured_on, value)?.label ?? null
  }
  return {
    weight: percentile('weight', m.weight_g === null ? null : m.weight_g / 1000),
    length: percentile('length', m.length_mm === null ? null : m.length_mm / 10),
    headCircumference: percentile('head', m.head_circumference_mm === null ? null : m.head_circumference_mm / 10),
  }
}

function formatMeasurement(profile: HealthProfile, m: GrowthMeasurement) {
  return {
    id: m.id,
    measuredOn: m.measured_on,
    ageMonths: ageOf(profile, m.measured_on)?.months ?? null,
    weightKg: m.weight_g === null ? null : m.weight_g / 1000,
    lengthCm: m.length_mm === null ? null : m.length_mm / 10,
    headCircumferenceCm: m.head_circumference_mm === null ? null : m.head_circumference_mm / 10,
    percentiles: percentiles(profile, m),
    note: m.note,
    createdBy: m.created_by_name,
  }
}

function formatVaccination(v: Vaccination) {
  return {
    id: v.id,
    vaccineCode: v.vaccine_code,
    vaccineLabel: v.vaccine_label,
    doseNumber: v.dose_number,
    givenOn: v.given_on,
    note: v.note,
    createdBy: v.created_by_name,
  }
}

export function registerHealthTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'get_health_summary',
    {
      title: 'Get health summary',
      description:
        "Health overview for a baby: birth date, sex, vaccination schedule in use (fr or ca_qc), age in days and months, the latest weight, length and head circumference with " +
        'their WHO percentile, and counts of measurements and vaccinations given. Percentiles are WHO Child Growth Standards and need a birth date and sex.',
      inputSchema: z.object({ babyId, timeZone }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId, timeZone }) => run('get_health_summary', { ...ctx, babyId }, async () => {
      const tz = timeZone ?? FAMILY_TIME_ZONE
      const today = todayInZone(tz)
      const profile = await getHealthProfileCore(admin, userId, babyId)
      const measurements = await listGrowthMeasurementsCore(admin, userId, babyId)
      const shots = await listVaccinationsCore(admin, userId, babyId)

      // Newest first: the first non-null value per metric is the latest.
      const latest = (pick: (m: GrowthMeasurement) => number | null, scale: number, indicator: 'weight' | 'length' | 'head' | 'headCircumference') => {
        const m = measurements.find((row) => pick(row) !== null)
        if (!m) return null
        const p = percentiles(profile, m)
        return {
          value: pick(m)! / scale,
          measuredOn: m.measured_on,
          percentile: indicator === 'weight' ? p.weight : indicator === 'length' ? p.length : p.headCircumference,
        }
      }

      const age = profile.birth_date ? ageOf(profile, today) : null
      return {
        today,
        timeZone: tz,
        birthDate: profile.birth_date,
        sex: profile.sex,
        vaccineSchedule: profile.vaccine_schedule,
        age: age ? { days: age.days, months: age.months } : null,
        latest: {
          weightKg: latest((m) => m.weight_g, 1000, 'weight'),
          lengthCm: latest((m) => m.length_mm, 10, 'length'),
          headCircumferenceCm: latest((m) => m.head_circumference_mm, 10, 'headCircumference'),
        },
        measurementCount: measurements.length,
        vaccinationCount: shots.length,
      }
    }),
  )

  server.registerTool(
    'set_health_profile',
    {
      title: 'Set health profile',
      description:
        'Sets the birth date, the sex at birth (used to pick the WHO curve) and/or the vaccination schedule (fr = French calendar, ca_qc = Québec PIQ). ' +
        'Only the fields you pass are changed. Admins only.',
      inputSchema: z.object({
        babyId,
        birthDate: day.optional(),
        sex: z.enum(['female', 'male']).optional(),
        vaccineSchedule: z.enum(VACCINE_SCHEDULE_KEYS).optional(),
        timeZone,
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ babyId, birthDate, sex, vaccineSchedule, timeZone }) => run('set_health_profile', { ...ctx, babyId }, async () => {
      if (birthDate === undefined && sex === undefined && vaccineSchedule === undefined) {
        throw new HealthValidationError('invalidDate')
      }
      await upsertHealthProfileCore(admin, userId, babyId, { birthDate, sex, vaccineSchedule }, timeZone ?? FAMILY_TIME_ZONE)
      return 'Profile saved.'
    }),
  )

  server.registerTool(
    'list_growth_measurements',
    {
      title: 'List growth measurements',
      description:
        'Lists weight / length (or height) / head circumference measurements, newest first, with the age in months and the WHO percentile for each metric ' +
        '(null without a birth date and sex). Optional from and to days (inclusive), limit defaults to 50.',
      inputSchema: z.object({
        babyId,
        from: day.optional(),
        to: day.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId, from, to, limit }) => run('list_growth_measurements', { ...ctx, babyId }, async () => {
      const profile = await getHealthProfileCore(admin, userId, babyId)
      const rows = await listGrowthMeasurementsCore(admin, userId, babyId, { from, to, limit: limit ?? 50 })
      return { measurements: rows.map((m) => formatMeasurement(profile, m)) }
    }),
  )

  server.registerTool(
    'add_growth_measurement',
    {
      title: 'Add a growth measurement',
      description:
        'Logs a measurement session. Pass at least one of weightKg, lengthCm (lying length under 24 months, height after) and headCircumferenceCm. ' +
        'measuredOn defaults to today in timeZone and cannot be in the future or before the birth date. Admins only.',
      inputSchema: z.object({
        babyId,
        measuredOn: day.optional(),
        weightKg: z.number().min(HEALTH_LIMITS.weightGMin / 1000).max(HEALTH_LIMITS.weightGMax / 1000).optional(),
        lengthCm: z.number().min(HEALTH_LIMITS.lengthMmMin / 10).max(HEALTH_LIMITS.lengthMmMax / 10).optional(),
        headCircumferenceCm: z.number().min(HEALTH_LIMITS.headMmMin / 10).max(HEALTH_LIMITS.headMmMax / 10).optional(),
        note: z.string().max(HEALTH_LIMITS.noteMax).optional(),
        timeZone,
      }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, measuredOn, weightKg, lengthCm, headCircumferenceCm, note, timeZone }) => run('add_growth_measurement', { ...ctx, babyId }, async () => {
      await createGrowthMeasurementCore(
        admin, userId, babyId,
        { measuredOn, weightKg, lengthCm, headCircumferenceCm, note },
        timeZone ?? FAMILY_TIME_ZONE,
      )
      return 'Measurement added.'
    }),
  )

  server.registerTool(
    'delete_growth_measurement',
    {
      title: 'Delete a growth measurement',
      description: 'Permanently deletes a measurement (id from list_growth_measurements). This cannot be undone. Admins only.',
      inputSchema: z.object({ babyId, measurementId: z.uuid().describe('Measurement id, from list_growth_measurements') }),
      annotations: { destructiveHint: true },
    },
    ({ babyId, measurementId }) => run('delete_growth_measurement', { ...ctx, babyId }, async () => {
      await deleteGrowthMeasurementCore(admin, userId, babyId, measurementId)
      return 'Measurement deleted.'
    }),
  )

  server.registerTool(
    'list_vaccinations',
    {
      title: 'List vaccinations given',
      description: 'Lists the vaccine shots already given, newest first, with vaccine code, label (for "other"), dose number and date.',
      inputSchema: z.object({ babyId }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId }) => run('list_vaccinations', { ...ctx, babyId }, async () => {
      const shots = await listVaccinationsCore(admin, userId, babyId)
      return { vaccinations: shots.map(formatVaccination) }
    }),
  )

  server.registerTool(
    'add_vaccination',
    {
      title: 'Record a vaccination',
      description:
        'Records a vaccine shot already given. doseNumber is assigned automatically (next dose of that vaccine) when omitted. ' +
        'givenOn defaults to today in timeZone and cannot be in the future or before the birth date. vaccineLabel is required when vaccineCode is other. ' +
        'Recording the same vaccine and dose twice is rejected. Admins only.',
      inputSchema: z.object({
        babyId,
        vaccineCode,
        vaccineLabel: z.string().max(HEALTH_LIMITS.labelMax).optional().describe('Name of the vaccine, required for other'),
        doseNumber: z.number().int().min(HEALTH_LIMITS.doseMin).max(HEALTH_LIMITS.doseMax).optional(),
        givenOn: day.optional(),
        note: z.string().max(HEALTH_LIMITS.noteMax).optional(),
        timeZone,
      }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, vaccineCode, vaccineLabel, doseNumber, givenOn, note, timeZone }) => run('add_vaccination', { ...ctx, babyId }, async () => {
      await createVaccinationCore(
        admin, userId, babyId,
        { vaccineCode, vaccineLabel, doseNumber, givenOn, note },
        timeZone ?? FAMILY_TIME_ZONE,
      )
      return 'Vaccination recorded.'
    }),
  )

  server.registerTool(
    'delete_vaccination',
    {
      title: 'Delete a vaccination record',
      description: 'Permanently deletes a vaccination record (id from list_vaccinations). This cannot be undone. Admins only.',
      inputSchema: z.object({ babyId, vaccinationId: z.uuid().describe('Vaccination id, from list_vaccinations') }),
      annotations: { destructiveHint: true },
    },
    ({ babyId, vaccinationId }) => run('delete_vaccination', { ...ctx, babyId }, async () => {
      await deleteVaccinationCore(admin, userId, babyId, vaccinationId)
      return 'Vaccination record deleted.'
    }),
  )

  server.registerTool(
    'list_upcoming_vaccines',
    {
      title: 'List upcoming vaccines',
      description:
        "Vaccines still to do on the baby's schedule (fr or ca_qc, see get_health_summary): overdue, due now, soon, and upcoming within withinMonths (default 6) from today. " +
        'Each has the schedule slot id, vaccine code, dose, dueFrom and dueBy dates and whether it is mandatory. Needs the birth date.',
      inputSchema: z.object({ babyId, withinMonths: z.number().int().min(0).max(120).optional(), timeZone }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId, withinMonths, timeZone }) => run('list_upcoming_vaccines', { ...ctx, babyId }, async () => {
      const upcoming = await getUpcomingVaccinesCore(admin, userId, babyId, timeZone ?? FAMILY_TIME_ZONE)
      if (!upcoming.birthDate) throw new HealthValidationError('missingBirthDate')
      const horizon = addMonthsToDay(upcoming.today, withinMonths ?? 6)
      const slots = upcoming.status.slots
        .filter((s) => !s.shot && s.status !== null && (s.status !== 'upcoming' || (s.dueFrom ?? '') <= horizon))
        .map((s) => ({
          slotId: s.slot.id,
          vaccineCode: s.slot.vaccineCode,
          dose: s.slot.dose,
          status: s.status,
          dueFrom: s.dueFrom,
          dueBy: s.dueBy,
          mandatory: s.slot.mandatory,
          optional: s.slot.optional ?? false,
        }))
      return { scheduleId: upcoming.scheduleId, schedule: upcoming.scheduleKey, today: upcoming.today, slots }
    }),
  )
}
