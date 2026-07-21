"use client";

import { Slider } from "@/components/ui/slider";
import { PickerProps } from "../../question_wrapper";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NumberPicker({ value, options, onChange, id }: PickerProps) {
  const numericValue = typeof value === "string" || typeof value === "number" ? value : "";
  const sliderValue: number[] = numericValue === "" ? [options?.min ?? 0] : [Number(numericValue)];
  const precision = typeof options?.precision === "number" ? options.precision : 2;
  const step = Math.pow(10, -precision);

  return (
    <div className="mx-auto grid w-full max-w-xs gap-3">
      <Input
        type="number"
        id={id}
        value={numericValue}
        min={options?.min ?? undefined}
        max={options?.max ?? undefined}
        step={step}
        onChange={(e) => onChange?.(e.target.value)}
        required
        disabled={!onChange}
        className="w-full"
      />
      <Slider
        id="slider-demo-temperature"
        value={sliderValue}
        onValueChange={(v) => onChange?.(Array.isArray(v) ? v[0] : v)}
        min={options?.min ?? undefined}
        max={options?.max ?? undefined}
        step={step}
      />
    </div>
  );
}

