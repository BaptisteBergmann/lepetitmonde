"use client";

import { PickerProps } from "../../question_wrapper";

export default function TextPicker({ value, options, onChange, id }: PickerProps) {
  return (
    <input
      type="text"
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-300 rounded-md p-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
      required
      disabled={!onChange}
    />
  );
}

