"use client";

interface TextPickerProps {
  selected: string;
  onChange: (date: string) => void;
}

export default function TextPicker({ selected, onChange }: TextPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">
      </label>
      <input
        type="text"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded-md p-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />
    </div>
  );
}

