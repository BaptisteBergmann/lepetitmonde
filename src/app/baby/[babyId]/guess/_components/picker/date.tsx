"use client";

import { Calendar } from "@/components/ui/calendar";
import { PickerProps } from "../../question_wrapper";

export default function CalendarPicker({ value, options, onChange, id }: PickerProps) {
  return (
    <Calendar
      mode="single"
      id={id}
      selected={value}
      onSelect={onChange}
      className="w-full rounded-lg border"
      captionLayout="dropdown"
      required
      disabled={!onChange}
      endMonth={new Date(2026, 11)}
      startMonth={new Date(2026, 7)}
      defaultMonth={new Date(2026, 8)}
    />
  );
}

