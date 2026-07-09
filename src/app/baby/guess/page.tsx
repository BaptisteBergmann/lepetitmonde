import { getQuestions } from "@/src/utils/actions/guesses/guesses_questions";
import Modal from "./_components/modal";
import RealtimeQuestionsList from "./_components/question_list";
import { getIsAdmin } from "@/src/utils/projects/project";

export default async function GuessesPage({ searchParams }: { searchParams: { projectId: string } }) {
  const projectId = (await searchParams).projectId;
  const questions = await getQuestions(projectId)


  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Pronostics de la famille</h1>

      {/* Formulaire pour ajouter un pronostic */}

      {/* Liste des pronostics */}
      <RealtimeQuestionsList projectId={projectId} initialQuestions={await getQuestions(projectId)} isAdmin={await getIsAdmin(projectId)}></RealtimeQuestionsList>
      <Modal></Modal>
    </div >
  );
}
