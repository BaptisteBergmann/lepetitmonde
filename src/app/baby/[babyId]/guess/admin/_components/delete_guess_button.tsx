'use client'

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteGuess } from "@/utils/actions/guesses";

export default function DeleteGuessButton({
  babyId,
  guessId,
  userName,
}: {
  babyId: string;
  guessId: string;
  userName: string;
}) {
  const router = useRouter();

  const handleConfirm = async () => {
    try {
      await deleteGuess(babyId, guessId);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de la suppression.");
      throw err;
    }
  };

  return (
    <ConfirmDialog
      title="Supprimer ce pronostic ?"
      description={`Le pronostic de ${userName} sera définitivement supprimé. Cette action est irréversible.`}
      confirmLabel="Supprimer"
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Supprimer le pronostic de {userName}</span>
        </Button>
      }
      onConfirm={handleConfirm}
    />
  );
}
