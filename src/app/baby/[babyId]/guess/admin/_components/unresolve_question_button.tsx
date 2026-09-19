"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { unresolveQuestion } from "@/utils/actions/guesses_questions";

export default function UnresolveQuestionButton({
  babyId,
  questionId,
}: {
  babyId: string;
  questionId: string;
}) {
  const t = useTranslations("guess.resolve");
  const router = useRouter();

  const handleConfirm = async () => {
    try {
      await unresolveQuestion(babyId, questionId);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert(t("saveError"));
      throw err;
    }
  };

  return (
    <ConfirmDialog
      title={t("reopenConfirmTitle")}
      description={t("reopenConfirmDescription")}
      confirmLabel={t("reopen")}
      destructive={false}
      trigger={
        <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-2xl cursor-pointer">
          <RotateCcw className="h-3.5 w-3.5" />
          {t("reopen")}
        </Button>
      }
      onConfirm={handleConfirm}
    />
  );
}
