"use client";

interface CalendarPickerProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export default function CalendarPicker({ selectedDate, onSelectDate }: CalendarPickerProps) {
  return (
    <div className="space-y-4 flex flex-col">
      {/* Champ pour la Date */}
      <div className="flex flex-col gap-2">
        <label htmlFor="birth_date_guess" className="text-sm font-medium text-gray-700">
          Date cible ou estimée :
        </label>
        <input
          type="date"
          id="birth_date_guess"
          name="birth_date_guess"
          value={selectedDate}
          onChange={(e) => onSelectDate(e.target.value)}
          className="border border-gray-300 rounded-md p-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>
    </div>
  );
}
