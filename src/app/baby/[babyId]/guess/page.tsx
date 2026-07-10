import { getQuestions } from "@utils/actions/guesses_questions";
import Modal from "./_components/modal";
import RealtimeQuestionsList from "./_components/question_list";

export default async function GuessesPage({ searchParams }: { searchParams: { babyId: string } }) {
  const babyId = (await searchParams).babyId;


  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Pronostics de la famille</h1>

      {/* Formulaire pour ajouter un pronostic */}

      {/* Liste des pronostics */}
      <RealtimeQuestionsList babyId={babyId} initialQuestions={await getQuestions(babyId)}></RealtimeQuestionsList>
      <Modal></Modal>
    </div >
  );
}
