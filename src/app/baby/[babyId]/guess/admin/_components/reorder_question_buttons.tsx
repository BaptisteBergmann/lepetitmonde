'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moveQuestion } from "@/utils/actions/guesses_questions";

export default function ReorderQuestionButtons({
  babyId,
  questionId,
  isFirst,
  isLast,
}: {
  babyId: string;
  questionId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations('guess.reorder');
  const router = useRouter();
  const [pending, setPending] = useState<"up" | "down" | null>(null);

  const handleMove = async (direction: "up" | "down") => {
    setPending(direction);
    try {
      await moveQuestion(babyId, questionId, direction);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert(t('moveError'));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={isFirst || pending !== null}
        className="h-6 w-6 rounded-lg cursor-pointer"
        onClick={() => handleMove("up")}
        aria-label={t('moveUp')}
      >
        {pending === "up" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={isLast || pending !== null}
        className="h-6 w-6 rounded-lg cursor-pointer"
        onClick={() => handleMove("down")}
        aria-label={t('moveDown')}
      >
        {pending === "down" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
