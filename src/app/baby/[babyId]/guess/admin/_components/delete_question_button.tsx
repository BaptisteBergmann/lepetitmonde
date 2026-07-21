'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteQuestion } from "@/utils/actions/guesses_questions";

export default function DeleteQuestionButton({ babyId, questionId }: { babyId: string; questionId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Supprimer ce pronostic ? Cette action est irréversible.")) return;

    setIsDeleting(true);
    try {
      await deleteQuestion(babyId, questionId);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de la suppression.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isDeleting}
      className="gap-1.5 rounded-2xl cursor-pointer text-destructive hover:text-destructive"
      onClick={handleDelete}
    >
      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      Supprimer
    </Button>
  );
}
