
import { getMyProposals, getQuestionsWithGuess, getQuestionsWithoutGuess } from "@/utils/actions/guesses_questions";
import GuessesTabs from "./guesses_tabs";
import MyProposals from "./_components/my_proposals";
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
  const myProposals = await getMyProposals(babyId)
  contextLogger.debug(myProposals, "My pending/rejected proposals")

  if (questionWithGuess.length === 0 && questionWithoutGuess.length === 0 && myProposals.length === 0) {
    return (
      <div className="text-center py-12 text-landing-muted border border-dashed border-landing-border rounded-2xl bg-landing-surface">
        <p className="text-sm font-medium">Aucun pronostic créé pour le moment.</p>
        <p className="text-xs text-landing-muted mt-1">Cliquez sur &quot;Proposer un pronostic&quot; pour en ajouter un.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MyProposals proposals={myProposals} />
      <GuessesTabs unanswered={questionWithoutGuess} answered={questionWithGuess} />
    </div>
  );
}
