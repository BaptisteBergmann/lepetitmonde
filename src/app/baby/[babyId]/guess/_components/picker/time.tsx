"use client";

import { PickerProps } from "../../question_wrapper";
import { TimePicker } from "@/components/ui/time-picker";

export default function TimePickerField({ value, onChange, id }: PickerProps) {
  const timeValue = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return <TimePicker id={id} value={timeValue} onChange={onChange} />;
}
