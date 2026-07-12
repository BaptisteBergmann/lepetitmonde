
import { getQuestionsWithGuess, getQuestionsWithoutGuess } from "@/utils/actions/guesses_questions";
import GuessesTabs from "./guesses_tabs";
import { logger } from "@/utils/logger";

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
    return (
      <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-2xl bg-muted/10">
        <p className="text-sm font-medium">Aucun pronostic créé pour le moment.</p>
        <p className="text-xs text-muted-foreground mt-1">Cliquez sur &quot;Nouveau pronostic&quot; pour en ajouter un.</p>
      </div>
    );
  }

  return (
    <GuessesTabs unanswered={questionWithoutGuess} answered={questionWithGuess} />
  );
}
