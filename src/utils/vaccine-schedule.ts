// French infant vaccine schedule as static, versioned config. Client-safe, no I/O.
//
// Checked on 2026-10-31 against the Vaccination Info Service page "Nourrissons et enfants
// (de la naissance a 10 ans)" (updated 2026-05-03): dose ages for hexavalent, pneumococcal,
// MenB, MenACWY, MMR, rotavirus and the 6-year DTCaP booster match this table. The official
// PDF calendar itself was not reachable, so re-check it when the next edition is published.
// Known doubt: that page says MenB/MenACWY are mandatory for children born since 2023-01-01,
// other sources say 2025-01-01; they are flagged mandatory here either way.
// `untilMonths` is our own grace limit (when a dose shows as overdue), not an official one.
//
// Bump SCHEDULE_ID whenever a row changes.

export const SCHEDULE_ID = 'fr-2026';

export const VACCINE_CODES = [
  'dtcap_hib_hepb',
  'pcv',
  'rotavirus',
  'menb',
  'menacwy',
  'mmr',
  'dtcap',
  'menc',
  'bcg',
  'hepb',
  'varicella',
  'influenza',
  'covid',
  'nirsevimab',
  'other',
] as const;

export type VaccineCode = (typeof VACCINE_CODES)[number];

export type VaccineDef = {
  code: VaccineCode;
  /** Message key under `health.vaccines.names`. */
  i18nKey: VaccineCode;
  /** In the schedule (true) or recordable only (false). */
  inSchedule: boolean;
};

const SCHEDULED: readonly VaccineCode[] = [
  'dtcap_hib_hepb',
  'pcv',
  'rotavirus',
  'menb',
  'menacwy',
  'mmr',
  'dtcap',
];

export const VACCINES: readonly VaccineDef[] = VACCINE_CODES.map((code) => ({
  code,
  i18nKey: code,
  inSchedule: SCHEDULED.includes(code),
}));

export function isVaccineCode(value: unknown): value is VaccineCode {
  return typeof value === 'string' && (VACCINE_CODES as readonly string[]).includes(value);
}

export type ScheduleSlot = {
  id: string;
  vaccineCode: VaccineCode;
  dose: number;
  fromMonths: number;
  /** The dose becomes overdue after this age (calendar months). */
  untilMonths: number;
  mandatory: boolean;
  /** Only for some products (e.g. 3-dose rotavirus): never shown as overdue. */
  optional?: boolean;
};

export const SCHEDULE: readonly ScheduleSlot[] = [
  { id: 'hexa-1', vaccineCode: 'dtcap_hib_hepb', dose: 1, fromMonths: 2, untilMonths: 3, mandatory: true },
  { id: 'pcv-1', vaccineCode: 'pcv', dose: 1, fromMonths: 2, untilMonths: 3, mandatory: true },
  { id: 'rota-1', vaccineCode: 'rotavirus', dose: 1, fromMonths: 2, untilMonths: 3, mandatory: false },
  { id: 'menb-1', vaccineCode: 'menb', dose: 1, fromMonths: 3, untilMonths: 4, mandatory: true },
  { id: 'rota-2', vaccineCode: 'rotavirus', dose: 2, fromMonths: 3, untilMonths: 4, mandatory: false },
  { id: 'hexa-2', vaccineCode: 'dtcap_hib_hepb', dose: 2, fromMonths: 4, untilMonths: 5, mandatory: true },
  { id: 'pcv-2', vaccineCode: 'pcv', dose: 2, fromMonths: 4, untilMonths: 5, mandatory: true },
  { id: 'rota-3', vaccineCode: 'rotavirus', dose: 3, fromMonths: 4, untilMonths: 5, mandatory: false, optional: true },
  { id: 'menb-2', vaccineCode: 'menb', dose: 2, fromMonths: 5, untilMonths: 6, mandatory: true },
  { id: 'menacwy-1', vaccineCode: 'menacwy', dose: 1, fromMonths: 6, untilMonths: 7, mandatory: true },
  { id: 'hexa-3', vaccineCode: 'dtcap_hib_hepb', dose: 3, fromMonths: 11, untilMonths: 12, mandatory: true },
  { id: 'pcv-3', vaccineCode: 'pcv', dose: 3, fromMonths: 11, untilMonths: 12, mandatory: true },
  { id: 'mmr-1', vaccineCode: 'mmr', dose: 1, fromMonths: 12, untilMonths: 13, mandatory: true },
  { id: 'menb-3', vaccineCode: 'menb', dose: 3, fromMonths: 12, untilMonths: 13, mandatory: true },
  { id: 'menacwy-2', vaccineCode: 'menacwy', dose: 2, fromMonths: 12, untilMonths: 13, mandatory: true },
  { id: 'mmr-2', vaccineCode: 'mmr', dose: 2, fromMonths: 16, untilMonths: 18, mandatory: true },
  { id: 'dtcap-6y', vaccineCode: 'dtcap', dose: 1, fromMonths: 72, untilMonths: 84, mandatory: false },
];
