// Pure, client-safe WHO growth maths (LMS method). No I/O, no Date.now().
import {
  WHO_LMS,
  type GrowthIndicator,
  type GrowthSex,
} from '@/utils/growth-who-data';

export type { GrowthIndicator, GrowthSex } from '@/utils/growth-who-data';

export type Lms = { l: number; m: number; s: number };

export const MAX_MONTHS = 60;
const DAYS_PER_MONTH = 30.4375;
const MS_PER_DAY = 86_400_000;

/** WHO standard percentile set and the matching z-scores. */
export const PERCENTILES = [3, 15, 50, 85, 97] as const;
export const PERCENTILE_Z = [-1.881, -1.036, 0, 1.036, 1.881] as const;

/** Beyond this the WHO tables lose meaning; shown values are capped for display. */
export const Z_DISPLAY_CAP = 5;

function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/** Whole days between two yyyy-MM-dd strings (negative when `date` is before `birthDate`). */
export function ageInDays(birthDate: string, date: string): number {
  return Math.round(dayNumber(date) - dayNumber(birthDate));
}

export function ageInMonths(birthDate: string, date: string): number {
  return ageInDays(birthDate, date) / DAYS_PER_MONTH;
}

/** LMS parameters at a fractional age in months, or null outside 0-60. */
export function lmsAt(
  indicator: GrowthIndicator,
  sex: GrowthSex,
  months: number,
): Lms | null {
  if (!Number.isFinite(months) || months < 0 || months > MAX_MONTHS) return null;
  const rows = WHO_LMS[indicator][sex];
  const lo = Math.min(Math.floor(months), MAX_MONTHS - 1);
  const a = rows[lo];
  const b = rows[lo + 1];
  const t = months - lo;
  return {
    l: a[1] + (b[1] - a[1]) * t,
    m: a[2] + (b[2] - a[2]) * t,
    s: a[3] + (b[3] - a[3]) * t,
  };
}

/** Value at a given z-score: M * (1 + L*S*z)^(1/L). */
export function valueAtZ({ l, m, s }: Lms, z: number): number {
  if (Math.abs(l) < 1e-9) return m * Math.exp(s * z);
  return m * Math.pow(1 + l * s * z, 1 / l);
}

/**
 * z-score of a value. The WHO restricted tail adjustment beyond +/-3 is ignored, which is
 * fine for a family app; the result is capped for display.
 */
export function zScore(value: number, { l, m, s }: Lms): number {
  const z =
    Math.abs(l) < 1e-9 ? Math.log(value / m) / s : (Math.pow(value / m, l) - 1) / (l * s);
  if (!Number.isFinite(z)) return z > 0 ? Z_DISPLAY_CAP : -Z_DISPLAY_CAP;
  return Math.max(-Z_DISPLAY_CAP, Math.min(Z_DISPLAY_CAP, z));
}

// Abramowitz & Stegun 7.1.26 (max error ~1.5e-7).
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
    t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

/** Percentile (0-100) for a z-score, via the normal CDF. */
export function percentile(z: number): number {
  return 50 * (1 + erf(z / Math.SQRT2));
}

/** Percentile text: "P48", "<P1" and ">P99" at the extremes. */
export function formatPercentile(z: number): string {
  const p = percentile(z);
  if (p < 1) return '<P1';
  if (p > 99) return '>P99';
  return `P${Math.round(p)}`;
}

/** Convenience: percentile info for a measured value, or null when out of range. */
export function evaluateMeasurement(
  indicator: GrowthIndicator,
  sex: GrowthSex,
  birthDate: string,
  date: string,
  value: number,
): { z: number; label: string; median: number; months: number } | null {
  const months = ageInMonths(birthDate, date);
  const lms = lmsAt(indicator, sex, months);
  if (!lms) return null;
  const z = zScore(value, lms);
  return { z, label: formatPercentile(z), median: lms.m, months };
}
