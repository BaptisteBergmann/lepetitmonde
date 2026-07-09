"use client";

interface NumberPickerProps {
  selected: number;
  options: any;
  onSelect: (number: number) => void;
}

export default function NumberPicker({ selected, options, onSelect }: NumberPickerProps) {
  console.log(options)
  return (
    <div className="space-y-4 flex flex-col">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">
          Date cible ou estimée :
        </label>
        <input
          type="number"
          value={selected}
          min={options?.min ?? undefined}
          max={options?.max ?? undefined}
          onChange={(e) => onSelect(e.target.value)}
          className="border border-gray-300 rounded-md p-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>
    </div>
  );
}

