
import { getQuestionsWithGuess, getQuestionsWithoutGuess } from "@/utils/actions/guesses_questions";
import QuestionsList from "./question_list";
import { logger } from "@/utils/logger";
import QuestionsListAnswered from "./question_list_answered";

export default async function QuestionsListWrapper({
  babyId,
}: {
  babyId: string
}) {
  const contextLogger = logger.child({ function: QuestionsListWrapper.name, babyId })
  const questionWithGuess = await getQuestionsWithGuess(babyId)
  contextLogger.debug(questionWithGuess, "Questions with guess")
  const questionWithoutGuess = await getQuestionsWithoutGuess(babyId)
  contextLogger.debug(questionWithoutGuess, "Questions without guess")


  if (questionWithGuess.length === 0 && questionWithoutGuess.length === 0) {
    return <p className="text-gray-500 mt-4 text-sm">Aucun pronostic créé pour le moment.</p>;
  }

  return (
    <ul className="mt-6 space-y-2">
      <QuestionsList init={questionWithoutGuess} />
      <QuestionsListAnswered init={questionWithGuess} />
    </ul>
  );
}
