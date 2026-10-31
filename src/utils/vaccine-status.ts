// Pure due/overdue computation for the vaccine schedule. Client-safe, no I/O.
import { addDays, addMonths, format } from 'date-fns';
import { SCHEDULE, type ScheduleSlot } from '@/utils/vaccine-schedule';

export type VaccineSlotStatus = 'given' | 'overdue' | 'due' | 'soon' | 'upcoming';

/** Minimal shape of a recorded shot (matches the `vaccinations` row). */
export type ShotLike = {
  vaccine_code: string;
  dose_number: number | null;
  given_on: string;
};

export type SlotState<T extends ShotLike> = {
  slot: ScheduleSlot;
  /** Null when the birth date is unknown and the slot isn't given. */
  status: VaccineSlotStatus | null;
  dueFrom: string | null;
  dueBy: string | null;
  shot: T | null;
};

export type VaccineSchedule<T extends ShotLike> = {
  slots: SlotState<T>[];
  /** Shots matching no slot: other, recordable-only codes, or a dose beyond the schedule. */
  unscheduled: T[];
};

const SOON_DAYS = 30;

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

/** Calendar-month offset on a yyyy-MM-dd string (date-fns clamps: Jan 31 + 1 month = Feb 28/29). */
export function addMonthsToDay(day: string, months: number): string {
  return fmt(addMonths(parseDay(day), months));
}

export function computeVaccineStatus<T extends ShotLike>(
  birthDate: string | null,
  today: string,
  shots: readonly T[],
): VaccineSchedule<T> {
  const matched = new Set<T>();
  const slots = SCHEDULE.map((slot): SlotState<T> => {
    const shot =
      shots.find(
        (s) => s.vaccine_code === slot.vaccineCode && s.dose_number === slot.dose,
      ) ?? null;
    if (shot) matched.add(shot);

    const dueFrom = birthDate ? addMonthsToDay(birthDate, slot.fromMonths) : null;
    const dueBy = birthDate ? addMonthsToDay(birthDate, slot.untilMonths) : null;

    let status: VaccineSlotStatus | null = null;
    if (shot) status = 'given';
    else if (dueFrom && dueBy) {
      // yyyy-MM-dd strings compare correctly as text.
      if (today > dueBy) status = slot.optional ? 'due' : 'overdue';
      else if (today >= dueFrom) status = 'due';
      else if (today >= fmt(addDays(parseDay(dueFrom), -SOON_DAYS))) status = 'soon';
      else status = 'upcoming';
    }
    return { slot, status, dueFrom, dueBy, shot };
  });

  return { slots, unscheduled: shots.filter((s) => !matched.has(s)) };
}
