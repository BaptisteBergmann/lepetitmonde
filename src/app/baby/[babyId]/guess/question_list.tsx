"use client";

import CalendarPicker from "./_components/picker/date";
import TextPicker from "./_components/picker/text";
import NumberPicker from "./_components/picker/number";
import { logger } from "@/utils/logger";



export default function QuestionsList({ init }) {
  const contextLogger = logger.child({ function: QuestionsList.name })
  contextLogger.debug(init, "Question with guess related")

  return (
    <ul className="mt-6 space-y-2">
      {init.map((question) => {
        contextLogger.debug(question, "Question with guess related loop")

        return (
          <li key={question.id} className="border-b py-2 text-black dark:text-white">
            <span className="font-medium">Question :</span> {question.title}
            {question.type === "date" && <CalendarPicker questionWithGuess={question} />}
            {question.type === "number" && <NumberPicker options={question.options} />}
            {question.type === "text" && <TextPicker />}
          </li>
        )
      })}
    </ul>
  );
}
