"use client";

import { Button } from "@/components/ui/button";
import { submitGuess } from "@/utils/actions/guesses";
import { logger } from "@/utils/logger";
import { Tables, Json } from "@/utils/supabase/database.types";
import { useState, Dispatch, SetStateAction } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getLocaleTag } from "@/utils/formatting";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { CheckCircle2, Send, Loader2, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { isExactMatch } from "@/utils/guess_scoring";
import CalendarPicker from "./_components/picker/date";
import NumberPicker from "./_components/picker/number";
import TextPicker from "./_components/picker/text";
import TimePicker from "./_components/picker/time";
import OptionPicker from "./_components/picker/option";

// The `options` column is a free-form Json in the DB, but in practice only ever
// holds this shape depending on the question's `type` (min/max/precision for
// "number", choices for "option", defaultMonth/highlightedDate for "date";
// unused for text/time).
export type QuestionOptions = {
  min?: number;
  max?: number;
  precision?: number;
  choices?: string[];
  defaultMonth?: string;
  highlightedDate?: string;
};

export interface PickerProps {
  value: number | string | Date | undefined;
  options: QuestionOptions | null;
  onChange: Dispatch<SetStateAction<number | string | Date | undefined>> | undefined;
  id: string;
}

export type QuestionWithGuess = Tables<"guess_questions"> & {
  guesses?: Tables<"guesses">[];
};

export default function QuestionWrapper({ questionWithGuess }: { questionWithGuess: QuestionWithGuess }) {
  const contextLogger = logger.child({ function: QuestionWrapper.name });
  contextLogger.info(questionWithGuess, "Display question");

  const router = useRouter();
  const t = useTranslations('guess.question');
  const localeTag = getLocaleTag(useLocale());
  const [value, setValue] = useState<number | string | Date | undefined>(
    // Non pré-rempli pour "date" : le Calendar attend un `Date | undefined`, jamais une chaîne vide.
    questionWithGuess.type === "date" ? undefined : ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasAnswered = !!questionWithGuess.guesses && questionWithGuess.guesses.length > 0;
  // The DB column is a free-form Json; see QuestionOptions for the actual shape used here.
  const questionOptions = questionWithGuess.options as QuestionOptions | null;
  const isResolved = !!questionWithGuess.resolved_at;
  const myGuess = questionWithGuess.guesses?.at(0);
  const isExact = isResolved && myGuess
    ? isExactMatch(questionWithGuess.type, questionWithGuess.correct_answer, myGuess.answer)
    : false;

  const handleSend = async () => {
    if (value === undefined || value === null || value === "") return;
    setIsSubmitting(true);
    try {
      await submitGuess({
        baby_id: questionWithGuess.baby_id,
        answer: value instanceof Date ? value.toISOString() : value,
        question_id: questionWithGuess.id,
      });
      router.refresh();
    } catch (err) {
      console.error(err);
      alert(t('submitError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDisplayValue = (val: Json | undefined, type: string, options: QuestionOptions | null) => {
    if (val === undefined || val === null || val === "") return "-";
    if (type === "date") {
      try {
        const d = new Date(val as string | number);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString(localeTag, {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
        }
      } catch (_) { }
    }
    if (type === "number") {
      const num = Number(val);
      if (!isNaN(num) && typeof options?.precision === "number") {
        return num.toLocaleString(localeTag, {
          minimumFractionDigits: options.precision,
          maximumFractionDigits: options.precision,
        });
      }
    }
    return String(val);
  };

  return (
    <Card className={`relative overflow-hidden transition-all duration-200 border ${hasAnswered
      ? "border-emerald-100 dark:border-emerald-950 bg-emerald-500/5 dark:bg-emerald-500/[0.02]"
      : "border-landing-border bg-landing-surface"
      }`}>
      <CardHeader className="pb-3 pt-5">
        <CardTitle className="font-display text-base font-semibold text-landing-foreground">
          {questionWithGuess.title}
        </CardTitle>
        {questionWithGuess.description && (
          <CardDescription className="text-xs text-landing-muted mt-1">
            {questionWithGuess.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="pb-4">
        {hasAnswered ? (
          <div className="space-y-2">
            <div className="bg-emerald-500/10 dark:bg-emerald-500/[0.05] border border-emerald-500/20 dark:border-emerald-500/10 rounded-2xl p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
                  {t('yourAnswer')}
                </span>
                <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                  {formatDisplayValue(myGuess?.answer, questionWithGuess.type, questionOptions)}
                </p>
              </div>
              <div className="bg-emerald-500 text-white rounded-full p-1.5 shadow-xs">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            {isResolved && (
              <div className={`rounded-2xl p-3 flex items-center justify-between gap-3 border ${isExact
                ? "border-amber-400/40 bg-amber-400/10"
                : "border-landing-border bg-landing-background"
                }`}>
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-landing-muted">
                    {t('correctAnswer')}
                  </span>
                  <p className="text-sm font-semibold text-landing-foreground">
                    {formatDisplayValue(questionWithGuess.correct_answer, questionWithGuess.type, questionOptions)}
                  </p>
                </div>
                {isExact && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    <Trophy className="h-4 w-4" />
                    {t('exactMatch')}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              {questionWithGuess.type === "date" && (
                <CalendarPicker
                  id={questionWithGuess.id}
                  options={questionOptions}
                  value={value}
                  onChange={setValue}
                />
              )}
              {questionWithGuess.type === "number" && (
                <NumberPicker
                  id={questionWithGuess.id}
                  options={questionOptions}
                  value={value}
                  onChange={setValue}
                />
              )}
              {questionWithGuess.type === "text" && (
                <TextPicker
                  id={questionWithGuess.id}
                  options={questionOptions}
                  value={value}
                  onChange={setValue}
                />
              )}
              {questionWithGuess.type === "time" && (
                <TimePicker
                  id={questionWithGuess.id}
                  options={questionOptions}
                  value={value}
                  onChange={setValue}
                />
              )}
              {questionWithGuess.type === "option" && (
                <OptionPicker
                  id={questionWithGuess.id}
                  options={questionOptions}
                  value={value}
                  onChange={setValue}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>

      {!hasAnswered && (
        <CardFooter className="pt-0 pb-4 flex justify-end">
          <Button
            onClick={handleSend}
            disabled={value === "" || value === undefined || value === null || isSubmitting}
            className="w-full gap-2 rounded-2xl cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('sending')}</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>{t('submit')}</span>
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
