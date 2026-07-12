
import { logger } from "@/utils/logger";
import QuestionWrapper from "./question_wrapper";



export default function QuestionsList({ init }) {
  const contextLogger = logger.child({ function: QuestionsList.name })
  contextLogger.debug(init, "Question with guess related")

  return (
    <ul className="mt-6 space-y-2">
      {init.map((question) => {
        contextLogger.debug(question, "Question with guess related loop")

        return (
          <li key={question.id} className="border-b py-2 text-black dark:text-white">
            <QuestionWrapper questionWithGuess={question} />
          </li>
        )
      })}
    </ul>
  );
}
