"use client";

import { PickerProps } from "../../question_wrapper";
import { Input } from "@/components/ui/input";

export default function TimePicker({ value, options, onChange, id }: PickerProps) {
  return (
    <Input
      type="time"
      id={id}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      required
      disabled={!onChange}
      className="w-full"
      step="1"
      defaultValue="10:30:00"
    />
  );
}

