"use client";

import { PickerProps } from "../../question_wrapper";
import { Input } from "@/components/ui/input";

export default function NumberPicker({ value, options, onChange, id }: PickerProps) {
  return (
    <Input
      type="number"
      id={id}
      value={value}
      min={options?.min ?? undefined}
      max={options?.max ?? undefined}
      onChange={(e) => onChange?.(e.target.value)}
      required
      disabled={!onChange}
      className="w-full"
    />
  );
}

