import Modal from "./_components/modal";
import { Suspense } from "react";
import QuestionsListWrapper from "./questions_list_wrapper";

export default async function GuessesPage({
  params,
}: {
  params: Promise<{ babyId: string }>
}) {
  const { babyId } = await params


  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Pronostics de la famille</h1>

      <Suspense>
        <QuestionsListWrapper babyId={babyId} />
      </Suspense>
      <Modal></Modal>
    </div >
  );
}
