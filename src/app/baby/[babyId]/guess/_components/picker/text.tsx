"use client";

import { PickerProps } from "../../question_wrapper";
import { Input } from "@/components/ui/input";
import { MAX_TEXT_ANSWER_LENGTH } from "@/utils/guess_scoring";

export default function TextPicker({ value, options, onChange, id }: PickerProps) {
  const textValue = typeof value === "string" || typeof value === "number" ? value : "";
  return (
    <Input
      type="text"
      id={id}
      value={textValue}
      onChange={(e) => onChange?.(e.target.value)}
      maxLength={MAX_TEXT_ANSWER_LENGTH}
      required
      disabled={!onChange}
      className="w-full"
    />
  );
}

