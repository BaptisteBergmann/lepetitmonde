"use client";

import { Button } from "@/components/ui/button";
import { submitGuess } from "@/utils/actions/gess";
import { logger } from "@/utils/logger";
import { useState } from "react";


export default function CalendarPicker({ questionWithGuess }) {
  const contextLogger = logger.child({ function: CalendarPicker.name })
  contextLogger.info(questionWithGuess, "Display date picker")
  const [dateValue, setDateValue] = useState(
    questionWithGuess.guess?.value || "" // Pré-remplir avec la valeur existante
  );

  const handleSend = async () => {

    await submitGuess({
      baby_id: questionWithGuess.baby_id,
      answer: dateValue,
      question_id: questionWithGuess.id,
    });
    alert("Pronostic envoyé !");
  };

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
          value={dateValue}
          onChange={(e) => setDateValue(e.target.value)}
          className="border border-gray-300 rounded-md p-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        <Button onClick={handleSend}>Envoyer Pronostique</Button>
      </div>
    </div>
  );
}
