"use client";

import { Button } from "@/components/ui/button";
import { submitGuess } from "@/utils/actions/gess";
import { logger } from "@/utils/logger";
import { useState } from "react";
import CalendarPicker from "./_components/picker/date";
import NumberPicker from "./_components/picker/number";
import TextPicker from "./_components/picker/text";

import { Dispatch } from "react";

export interface PickerProps {
  value: number;
  options: any;
  onChange: Dispatch<any> | undefined;
  id: string;
}

export default function QuestionWrapper({ questionWithGuess }) {
  const contextLogger = logger.child({ function: QuestionWrapper.name })
  contextLogger.info(questionWithGuess, "Display question")
  const [value, setValue] = useState(
    questionWithGuess.guesses?.at(0)?.answer || "" // Pré-remplir avec la valeur existante
  );

  const handleSend = async () => {

    await submitGuess({
      baby_id: questionWithGuess.baby_id,
      answer: value,
      question_id: questionWithGuess.id,
    });
    alert("Pronostic envoyé !");
  };

  return (
    <div className="space-y-4 flex flex-col">
      <div className="flex flex-col gap-2">
        <label htmlFor={questionWithGuess.id} className="text-sm font-medium text-gray-700">
          {questionWithGuess.title}
        </label>
        {questionWithGuess.type === "date" && <CalendarPicker id={questionWithGuess.id} options={questionWithGuess.options} value={value} onChange={questionWithGuess.guesses ? undefined : setValue} />}
        {questionWithGuess.type === "number" && <NumberPicker id={questionWithGuess.id} options={questionWithGuess.options} value={value} onChange={questionWithGuess.guesses ? undefined : setValue} />}
        {questionWithGuess.type === "text" && <TextPicker id={questionWithGuess.id} options={questionWithGuess.options} value={value} onChange={questionWithGuess.guesses ? undefined : setValue} />}
        {!questionWithGuess.guesses && (
          <Button onClick={handleSend}>Envoyer Pronostique</Button>
        )
        }
      </div>
    </div>
  );
}
