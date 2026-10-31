// National infant vaccine schedules as static, versioned config. Client-safe, no I/O.
// A baby picks one (baby_health_profiles.vaccine_schedule); given shots are matched to
// slots by (vaccine code, dose), so switching schedule never loses a recorded shot.
//
// fr (fr-2026): checked on 2026-10-31 against the Vaccination Info Service page "Nourrissons
//   et enfants (de la naissance a 10 ans)" (updated 2026-05-03): dose ages for hexavalent,
//   pneumococcal, MenB, MenACWY, MMR, rotavirus and the 6-year DTCaP booster match. The
//   official PDF calendar was not reachable, so re-check it when the next edition is
//   published. Doubt: that page says MenB/MenACWY are mandatory for children born since
//   2023-01-01, other sources say 2025-01-01; both are flagged mandatory here.
// ca_qc (ca-qc-2026): checked on 2026-10-31 against Quebec.ca "Versions accessibles des
//   calendriers de vaccination par groupes d'age" (Programme quebecois d'immunisation,
//   updated 2026-07-20). That page is a text summary, not the PIQ itself. Doubts:
//   - It lists both DCaT-HB-VPI-Hib and DCaT-VPI-Hib at 2 and 4 months without saying who
//     gets which; both products fill the same slots (`alsoCodes`).
//   - It says "meningocoque" at 18 months without naming the product; recorded as
//     `menacwy`, which may be MenC-ACYW in practice. Treat the code as approximate.
//   - Hepatitis A+B at 18 months is modelled as the combined `hepa_hepb`.
//   - The RSV preventive treatment (nirsevimab) is seasonal at birth, so it is recordable
//     only, not a slot.
//   Quebec has no mandatory childhood vaccine, so every ca_qc slot is `mandatory: false`.
// `untilMonths` is our own grace limit (when a dose shows as overdue), not an official one.
//
// Bump a schedule's `id` whenever its rows change.

export const VACCINE_SCHEDULE_KEYS = ['fr', 'ca_qc'] as const;
export type VaccineScheduleKey = (typeof VACCINE_SCHEDULE_KEYS)[number];
export const DEFAULT_VACCINE_SCHEDULE: VaccineScheduleKey = 'fr';

export function isVaccineScheduleKey(value: unknown): value is VaccineScheduleKey {
  return (
    typeof value === 'string' &&
    (VACCINE_SCHEDULE_KEYS as readonly string[]).includes(value)
  );
}

export const VACCINE_CODES = [
  'dtcap_hib_hepb',
  'dtcap_hib',
  'pcv',
  'rotavirus',
  'menb',
  'menacwy',
  'mmr',
  'mmrv',
  'dtcap',
  'hepa_hepb',
  'menc',
  'bcg',
  'hepa',
  'hepb',
  'varicella',
  'influenza',
  'covid',
  'nirsevimab',
  'other',
] as const;

export type VaccineCode = (typeof VACCINE_CODES)[number];

export function isVaccineCode(value: unknown): value is VaccineCode {
  return typeof value === 'string' && (VACCINE_CODES as readonly string[]).includes(value);
}

export type ScheduleSlot = {
  id: string;
  vaccineCode: VaccineCode;
  /** Other codes that fill this slot (e.g. a product without hepatitis B). */
  alsoCodes?: readonly VaccineCode[];
  dose: number;
  fromMonths: number;
  /** The dose becomes overdue after this age (calendar months). */
  untilMonths: number;
  mandatory: boolean;
  /** Only for some products (e.g. 3-dose rotavirus): never shown as overdue. */
  optional?: boolean;
};

export type VaccineScheduleDef = {
  /** Versioned id, bumped when rows change (e.g. `fr-2026`). */
  id: string;
  slots: readonly ScheduleSlot[];
};

const slot = (
  id: string,
  vaccineCode: VaccineCode,
  dose: number,
  fromMonths: number,
  untilMonths: number,
  mandatory: boolean,
  extra: Pick<ScheduleSlot, 'optional' | 'alsoCodes'> = {},
): ScheduleSlot => ({ id, vaccineCode, dose, fromMonths, untilMonths, mandatory, ...extra });

const FR: VaccineScheduleDef = {
  id: 'fr-2026',
  slots: [
    slot('hexa-1', 'dtcap_hib_hepb', 1, 2, 3, true),
    slot('pcv-1', 'pcv', 1, 2, 3, true),
    slot('rota-1', 'rotavirus', 1, 2, 3, false),
    slot('menb-1', 'menb', 1, 3, 4, true),
    slot('rota-2', 'rotavirus', 2, 3, 4, false),
    slot('hexa-2', 'dtcap_hib_hepb', 2, 4, 5, true),
    slot('pcv-2', 'pcv', 2, 4, 5, true),
    slot('rota-3', 'rotavirus', 3, 4, 5, false, { optional: true }),
    slot('menb-2', 'menb', 2, 5, 6, true),
    slot('menacwy-1', 'menacwy', 1, 6, 7, true),
    slot('hexa-3', 'dtcap_hib_hepb', 3, 11, 12, true),
    slot('pcv-3', 'pcv', 3, 11, 12, true),
    slot('mmr-1', 'mmr', 1, 12, 13, true),
    slot('menb-3', 'menb', 3, 12, 13, true),
    slot('menacwy-2', 'menacwy', 2, 12, 13, true),
    slot('mmr-2', 'mmr', 2, 16, 18, true),
    slot('dtcap-6y', 'dtcap', 1, 72, 84, false),
  ],
};

const QC_DTCAP_HIB = { alsoCodes: ['dtcap_hib'] } as const;

const CA_QC: VaccineScheduleDef = {
  id: 'ca-qc-2026',
  slots: [
    slot('qc-hexa-1', 'dtcap_hib_hepb', 1, 2, 3, false, QC_DTCAP_HIB),
    slot('qc-pcv-1', 'pcv', 1, 2, 3, false),
    slot('qc-rota-1', 'rotavirus', 1, 2, 3, false),
    slot('qc-hexa-2', 'dtcap_hib_hepb', 2, 4, 5, false, QC_DTCAP_HIB),
    slot('qc-pcv-2', 'pcv', 2, 4, 5, false),
    slot('qc-rota-2', 'rotavirus', 2, 4, 5, false),
    slot('qc-mmrv-1', 'mmrv', 1, 12, 13, false),
    slot('qc-pcv-3', 'pcv', 3, 12, 13, false),
    slot('qc-mmrv-2', 'mmrv', 2, 18, 19, false),
    slot('qc-menacwy-1', 'menacwy', 1, 18, 19, false),
    slot('qc-hepa-hepb-1', 'hepa_hepb', 1, 18, 19, false),
    // "Between 4 and 6 years".
    slot('qc-dtcap-4y', 'dtcap', 1, 48, 72, false),
  ],
};

export const VACCINE_SCHEDULES: Record<VaccineScheduleKey, VaccineScheduleDef> = {
  fr: FR,
  ca_qc: CA_QC,
};

export function getVaccineSchedule(key: VaccineScheduleKey): VaccineScheduleDef {
  return VACCINE_SCHEDULES[key];
}

export type VaccineDef = {
  code: VaccineCode;
  /** Message key under `health.vaccines.names`. */
  i18nKey: VaccineCode;
  /** In at least one schedule (true) or recordable only (false). */
  inSchedule: boolean;
};

const SCHEDULED = new Set<VaccineCode>(
  Object.values(VACCINE_SCHEDULES).flatMap((def) =>
    def.slots.flatMap((s) => [s.vaccineCode, ...(s.alsoCodes ?? [])]),
  ),
);

export const VACCINES: readonly VaccineDef[] = VACCINE_CODES.map((code) => ({
  code,
  i18nKey: code,
  inSchedule: SCHEDULED.has(code),
}));
