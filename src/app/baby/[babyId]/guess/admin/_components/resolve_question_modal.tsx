"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { resolveQuestion } from "@/utils/actions/guesses_questions";
import { Tables, Json } from "@/utils/supabase/database.types";
import { QuestionOptions } from "../../question_wrapper";
import CalendarPicker from "../../_components/picker/date";
import NumberPicker from "../../_components/picker/number";
import TextPicker from "../../_components/picker/text";
import TimePickerField from "../../_components/picker/time";
import OptionPicker from "../../_components/picker/option";

type GuessQuestion = Tables<"guess_questions">;

export default function ResolveQuestionModal({
  babyId,
  question,
}: {
  babyId: string;
  question: GuessQuestion;
}) {
  const t = useTranslations("guess.resolve");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const storedAnswer = question.correct_answer;
  const [value, setValue] = useState<number | string | Date | undefined>(
    question.type === "date"
      ? (typeof storedAnswer === "string" ? new Date(storedAnswer) : undefined)
      : (storedAnswer === null || storedAnswer === undefined ? "" : String(storedAnswer))
  );

  const questionOptions = question.options as QuestionOptions | null;
  const isResolved = !!question.resolved_at;

  const handleConfirm = async () => {
    if (value === undefined || value === null || value === "") return;
    setIsPending(true);
    try {
      const correctAnswer: Json = value instanceof Date ? value.toISOString() : value;
      await resolveQuestion(babyId, question.id, correctAnswer);
      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div>
      <Button
        type="button"
        variant={isResolved ? "outline" : "default"}
        size="sm"
        className="gap-1.5 rounded-2xl cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {isResolved ? t("editAnswer") : t("resolve")}
      </Button>

      {open && createPortal(
        <div
          className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-in fade-in-0 duration-200"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[420px] max-h-[90vh] bg-landing-surface text-landing-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-landing-border animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-landing-border py-4 px-5">
              <h2 className="font-display text-base font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4.5 w-4.5 text-primary" />
                {isResolved ? t("editAnswerTitle") : t("resolveTitle")}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              <p className="text-xs text-landing-muted bg-landing-background rounded-2xl px-3 py-2">
                {t("notice")}
              </p>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("correctAnswerLabel")}
                </Label>
                {question.type === "date" && (
                  <CalendarPicker id={question.id} options={questionOptions} value={value} onChange={setValue} />
                )}
                {question.type === "number" && (
                  <NumberPicker id={question.id} options={questionOptions} value={value} onChange={setValue} />
                )}
                {question.type === "text" && (
                  <TextPicker id={question.id} options={questionOptions} value={value} onChange={setValue} />
                )}
                {question.type === "time" && (
                  <TimePickerField id={question.id} options={questionOptions} value={value} onChange={setValue} />
                )}
                {question.type === "option" && (
                  <OptionPicker id={question.id} options={questionOptions} value={value} onChange={setValue} />
                )}
              </div>
            </div>

            <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
              <Button variant="outline" className="rounded-2xl cursor-pointer" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                disabled={value === "" || value === undefined || value === null || isPending}
                className="rounded-2xl cursor-pointer"
                onClick={handleConfirm}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t("saving")}</span>
                  </>
                ) : (
                  <span>{t("confirm")}</span>
                )}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
