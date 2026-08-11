'use client'

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations('guess');
  const tDelete = useTranslations('guess.deleteGuess');
  const router = useRouter();

  const handleConfirm = async () => {
    try {
      await deleteGuess(babyId, guessId);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert(t('deleteError'));
      throw err;
    }
  };

  return (
    <ConfirmDialog
      title={tDelete('confirmTitle')}
      description={tDelete('confirmDescription', { userName })}
      confirmLabel={t('delete')}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">{tDelete('srDelete', { userName })}</span>
        </Button>
      }
      onConfirm={handleConfirm}
    />
  );
}
