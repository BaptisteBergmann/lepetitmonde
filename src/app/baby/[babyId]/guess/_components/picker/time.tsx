"use client";

import { PickerProps } from "../../question_wrapper";
import { Input } from "@/components/ui/input";

export default function TimePicker({ value, options, onChange, id }: PickerProps) {
  const timeValue = typeof value === "string" || typeof value === "number" ? value : "";
  return (
    <Input
      type="time"
      id={id}
      value={timeValue}
      onChange={(e) => onChange?.(e.target.value)}
      required
      disabled={!onChange}
      className="w-full"
      step="1"
      defaultValue="10:30:00"
    />
  );
}

