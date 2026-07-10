"use client";

import { useEffect, useState } from "react";
import { createClient } from "@utils/supabase/client"; // Ajustez selon votre chemin d'accès
import CalendarPicker from "./picker/date";
import { Tables } from "@utils/supabase/database.types";
import TextPicker from "./picker/text";
import NumberPicker from "./picker/number";

type GuessQuestion = Tables<'guess_questions'>;

interface RealtimeQuestionsListProps {
  initialQuestions: GuessQuestion[];
  babyId: string;
  isAdmin: boolean;
}

export default function RealtimeQuestionsList({
  initialQuestions,
  babyId,
  isAdmin,
}: RealtimeQuestionsListProps) {
  const [questions, setQuestions] = useState<GuessQuestion[]>(initialQuestions);
  const supabase = createClient();


  // Permet de synchroniser l'état si les props serveur changent (ex: navigation)
  useEffect(() => {
    setQuestions(initialQuestions);
  }, [initialQuestions]);

  useEffect(() => {
    // Écoute en temps réel uniquement les changements sur la table guess_questions
    const channel = supabase
      .channel(`realtime-questions-${babyId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Écoute INSERT, UPDATE, DELETE
          schema: "public",
          table: "guess_questions", // Remplacez par le nom exact de votre table
          filter: `baby_id=eq.${babyId}`, // Filtre uniquement pour ce bébé/projet
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newQuestion = payload.new as GuessQuestion;
            setQuestions((prev) => [...prev, newQuestion]);
          } else if (payload.eventType === "DELETE") {
            setQuestions((prev) => prev.filter((q) => q.id !== payload.old.id));
          } else if (payload.eventType === "UPDATE") {
            const updatedQuestion = payload.new as GuessQuestion;
            setQuestions((prev) =>
              prev.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q))
            );
          }
        }
      )
      .subscribe();

    // Nettoyage de la connexion WebSocket quand l'utilisateur quitte la page
    return () => {
      supabase.removeChannel(channel);
    };
  }, [babyId, supabase]);

  if (questions.length === 0) {
    return <p className="text-gray-500 mt-4 text-sm">Aucun pronostic créé pour le moment.</p>;
  }

  return (
    <ul className="mt-6 space-y-2">
      {questions.map((question) => (
        <li key={question.id} className="border-b py-2 text-black dark:text-white">
          <span className="font-medium">Question :</span> {question.title}
          {question.type === "date" && <CalendarPicker />}
          {question.type === "number" && <NumberPicker options={question.options} />}
          {question.type === "text" && <TextPicker />}
          {isAdmin && <div>EDIT</div>}
        </li>
      ))}
    </ul>
  );
}
