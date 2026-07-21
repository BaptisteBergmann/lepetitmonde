"use client";

import { PickerProps } from "../../question_wrapper";
import { Button } from "@/components/ui/button";

export default function OptionPicker({ value, options, onChange, id }: PickerProps) {
  const choices: string[] = Array.isArray(options?.choices) ? options.choices : [];

  return (
    <div id={id} className="flex flex-wrap gap-2">
      {choices.map((choice) => (
        <Button
          key={choice}
          type="button"
          variant={value === choice ? "default" : "outline"}
          disabled={!onChange}
          onClick={() => onChange?.(choice)}
          className="rounded-2xl"
        >
          {choice}
        </Button>
      ))}
    </div>
  );
}
