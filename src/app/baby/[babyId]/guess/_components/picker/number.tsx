"use client";

import { Slider } from "@/components/ui/slider";
import { PickerProps } from "../../question_wrapper";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NumberPicker({ value, options, onChange, id }: PickerProps) {
  return (
    <div className="mx-auto grid w-full max-w-xs gap-3">
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
      <Slider
        id="slider-demo-temperature"
        value={value}
        onValueChange={onChange}
        min={options?.min ?? undefined}
        max={options?.max ?? undefined}
        step={0.001}
      />
    </div>
  );
}

