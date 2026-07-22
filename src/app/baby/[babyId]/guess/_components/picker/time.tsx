"use client";

import { PickerProps } from "../../question_wrapper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const HOURS_ITEMS = Object.fromEntries(HOURS.map((h) => [h, h]));
const MINUTES_ITEMS = Object.fromEntries(MINUTES.map((m) => [m, m]));

export default function TimePicker({ value, onChange, id }: PickerProps) {
  const timeValue = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const [hours = "", minutes = ""] = timeValue.split(":");

  const emit = (h: string, m: string) => {
    if (h && m) onChange?.(`${h}:${m}`);
  };

  return (
    <div id={id} className="flex items-center gap-2">
      <Select
        items={HOURS_ITEMS}
        value={hours || undefined}
        onValueChange={(h) => h && emit(h as string, minutes || "00")}
        disabled={!onChange}
      >
        <SelectTrigger className="w-full text-foreground bg-input/50">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-lg font-semibold text-landing-muted">:</span>
      <Select
        items={MINUTES_ITEMS}
        value={minutes || undefined}
        onValueChange={(m) => m && emit(hours || "00", m as string)}
        disabled={!onChange}
      >
        <SelectTrigger className="w-full text-foreground bg-input/50">
          <SelectValue placeholder="MM" />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
