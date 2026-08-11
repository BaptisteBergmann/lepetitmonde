import { getTranslations } from "next-intl/server";
import { getMyProposals, getQuestionsWithGuess, getQuestionsWithoutGuess } from "@/utils/actions/guesses_questions";
import { getUserAccess } from "@/utils/actions/users";
import GuessesTabs from "./guesses_tabs";
import MyProposals from "./_components/my_proposals";
import { logger } from "@/utils/logger";

export default async function QuestionsListWrapper({
  babyId,
}: {
  babyId: string
}) {
  const contextLogger = logger.child({ function: QuestionsListWrapper.name, babyId })
  const t = await getTranslations('guess')
  const questionWithGuess = await getQuestionsWithGuess(babyId)
  contextLogger.debug(questionWithGuess, "Questions with guess")
  const questionWithoutGuess = await getQuestionsWithoutGuess(babyId)
  contextLogger.debug(questionWithoutGuess, "Questions without guess")
  const myProposals = await getMyProposals(babyId)
  contextLogger.debug(myProposals, "My pending/rejected proposals")
  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === "admin"

  if (questionWithGuess.length === 0 && questionWithoutGuess.length === 0 && myProposals.length === 0) {
    return (
      <div className="text-center py-12 text-landing-muted border border-dashed border-landing-border rounded-2xl bg-landing-surface">
        <p className="text-sm font-medium">{t('empty')}</p>
        <p className="text-xs text-landing-muted mt-1">{t('emptyHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MyProposals proposals={myProposals} />
      <GuessesTabs unanswered={questionWithoutGuess} answered={questionWithGuess} babyId={babyId} isAdmin={isAdmin} />
    </div>
  );
}
