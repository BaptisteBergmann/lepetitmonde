"use client";

import { PickerProps } from "../../question_wrapper";
import { Input } from "@/components/ui/input";

export default function CalendarPicker({ value, options, onChange, id }: PickerProps) {
  return (
    <Input
      type="date"
      id={id}
      name="CalendarPicker"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      required
      disabled={!onChange}
      className="w-full cursor-pointer"
    />
  );
}

