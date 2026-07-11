
import { getQuestions } from "@/utils/actions/guesses_questions";
import QuestionsList from "./question_list";
import { getBaby } from "@/utils/actions/baby";


export default async function QuestionsListWrapper({
  babyId,
}: {
  babyId: string
}) {
  const questions = await getQuestions(babyId);
  const baby = await getBaby(babyId)


  if (questions.length === 0) {
    return <p className="text-gray-500 mt-4 text-sm">Aucun pronostic créé pour le moment.</p>;
  }

  return (
    <ul className="mt-6 space-y-2">
      <QuestionsList initialQuestions={questions} isAdmin={baby.isAdmin} />
    </ul>
  );
}
