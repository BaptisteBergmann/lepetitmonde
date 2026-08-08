"use client";

import { Calendar } from "@/components/ui/calendar";
import { PickerProps } from "../../question_wrapper";

// Parses a "YYYY-MM" or "YYYY-MM-DD" string as a local date, avoiding the
// UTC-midnight shift that `new Date("YYYY-MM-DD")` introduces.
function parseLocalDate(value: string): Date | undefined {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month) return undefined;
  return new Date(year, month - 1, day || 1);
}

export default function CalendarPicker({ value, options, onChange, id }: PickerProps) {
  const selected = value instanceof Date ? value : value ? new Date(value) : undefined;
  const defaultMonth = (options?.defaultMonth && parseLocalDate(options.defaultMonth)) || new Date(2026, 8);
  const highlightedDate = options?.highlightedDate ? parseLocalDate(options.highlightedDate) : undefined;

  return (
    <Calendar
      mode="single"
      id={id}
      selected={selected}
      onSelect={onChange}
      className="w-full rounded-lg border"
      captionLayout="dropdown"
      required
      disabled={!onChange}
      endMonth={new Date(2026, 11)}
      startMonth={new Date(2026, 7)}
      defaultMonth={defaultMonth}
      modifiers={highlightedDate ? { highlighted: highlightedDate } : undefined}
      modifiersClassNames={{ highlighted: "ring-2 ring-inset ring-primary/60 rounded-(--cell-radius)" }}
    />
  );
}

