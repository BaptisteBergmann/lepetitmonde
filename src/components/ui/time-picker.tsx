"use client";

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

interface TimePickerProps {
  id?: string;
  value: string | undefined;
  onChange?: (value: string) => void;
}

// Value is "HH:MM", 24h, zero-padded. Read-only when `onChange` is omitted.
export function TimePicker({ value, onChange, id }: TimePickerProps) {
  const [hours = "", minutes = ""] = (value ?? "").split(":");

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
