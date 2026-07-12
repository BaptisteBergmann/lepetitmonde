"use client";

import { PickerProps } from "../../question_wrapper";
import { Input } from "@/components/ui/input";

export default function TextPicker({ value, options, onChange, id }: PickerProps) {
  return (
    <Input
      type="text"
      id={id}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      required
      disabled={!onChange}
      className="w-full"
    />
  );
}

