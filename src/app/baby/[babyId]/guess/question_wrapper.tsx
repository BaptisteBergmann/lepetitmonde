"use client";

import { toast } from 'sonner'
import { Button } from "@/components/ui/button";
import { submitGuess } from "@/utils/actions/guesses";
import type { MyResult } from "@/utils/actions/guesses";
import { isClosestWinsType } from "@/utils/guess_scoring";
import { logger } from "@/utils/logger";
import { Tables } from "@/utils/supabase/database.types";
import { useState, Dispatch, SetStateAction } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getLocaleTag } from "@/utils/formatting";
import { formatAnswer } from "@/utils/guess_format";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowRight, CheckCircle2, Send, Loader2, Lock, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { cn } from "@utils/utils";
import { useRouter } from "next/navigation";
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
  guesses?: Omit<Tables<"guesses">, "is_correct" | "is_funny">[];
};

export default function QuestionWrapper({
  questionWithGuess,
  result,
}: {
  questionWithGuess: QuestionWithGuess;
  // Own score on a resolved question, computed server-side.
  result?: MyResult;
}) {
  const contextLogger = logger.child({ function: QuestionWrapper.name, questionId: questionWithGuess.id });

  const router = useRouter();
  const t = useTranslations('guess.question');
  const tErrors = useTranslations('serverErrors');
  const localeTag = getLocaleTag(useLocale());
  const [value, setValue] = useState<number | string | Date | undefined>(
    // Non pré-rempli pour "date" : le Calendar attend un `Date | undefined`, jamais une chaîne vide.
    questionWithGuess.type === "date" ? undefined : ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasAnswered = !!questionWithGuess.guesses && questionWithGuess.guesses.length > 0;
  const isResolved = hasAnswered && !!questionWithGuess.resolved_at;
  // The DB column is a free-form Json; see QuestionOptions for the actual shape used here.
  const questionOptions = questionWithGuess.options as QuestionOptions | null;

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
      contextLogger.error(err, "Error submitting guess");
      // Stale tab: the question was closed after this page loaded.
      if (err instanceof Error && err.message === tErrors('pronosticClosed')) {
        toast.error(err.message);
        router.refresh();
      } else {
        toast.error(t('submitError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className={`relative overflow-hidden transition-all duration-200 border ${hasAnswered && !isResolved
      ? "border-emerald-100 dark:border-emerald-950 bg-emerald-500/5 dark:bg-emerald-500/[0.02]"
      : "border-landing-border bg-landing-surface"
      }`}>
      <CardHeader className="pb-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="font-display text-base font-semibold text-landing-foreground">
            {questionWithGuess.title}
          </CardTitle>
          {isResolved && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden />
              {t('closed')}
            </span>
          )}
        </div>
        {questionWithGuess.description && (
          <CardDescription className="text-xs text-landing-muted mt-1">
            {questionWithGuess.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="pb-4">
        {isResolved ? (
          <div>
            <div className={cn(
              "grid gap-2",
              questionWithGuess.type === "text" ? "grid-cols-1 min-[400px]:grid-cols-2" : "grid-cols-2"
            )}>
              <div className="space-y-0.5 rounded-2xl border border-landing-border bg-landing-background p-3">
                <span className="text-xs uppercase font-bold tracking-wider text-landing-muted">
                  {t('yourAnswer')}
                </span>
                <p className="text-base font-extrabold text-landing-foreground break-words">
                  {formatAnswer(questionWithGuess.guesses?.at(0)?.answer, questionWithGuess.type, questionWithGuess.options, localeTag)}
                </p>
              </div>
              <div className="space-y-0.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <span className="inline-flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
                  <Target className="h-3 w-3" aria-hidden />
                  {t('correctAnswer')}
                </span>
                <p className="text-base font-extrabold text-emerald-700 break-words dark:text-emerald-300">
                  {formatAnswer(questionWithGuess.correct_answer, questionWithGuess.type, questionWithGuess.options, localeTag)}
                </p>
              </div>
            </div>
            <p className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
              (result?.points ?? 0) > 0
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            )}>
              {(result?.points ?? 0) > 0 && <Trophy className="h-4 w-4" aria-hidden />}
              <span>
                {t('youEarned', { count: result?.points ?? 0 })}
                {result?.rank !== undefined && isClosestWinsType(questionWithGuess.type) && (
                  <> · {t('podium', { rank: result.rank })}</>
                )}
              </span>
            </p>
          </div>
        ) : hasAnswered ? (
          <div className="bg-emerald-500/10 dark:bg-emerald-500/[0.05] border border-emerald-500/20 dark:border-emerald-500/10 rounded-2xl p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
                {t('yourAnswer')}
              </span>
              <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                {formatAnswer(questionWithGuess.guesses?.at(0)?.answer, questionWithGuess.type, questionWithGuess.options, localeTag)}
              </p>
            </div>
            <div className="bg-emerald-500 text-white rounded-full p-1.5 shadow-xs">
              <CheckCircle2 className="h-4 w-4" />
            </div>
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

      {isResolved && (
        <CardFooter className="pt-0 pb-4">
          <Link
            href={`/baby/${questionWithGuess.baby_id}/guess/leaderboard`}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('seeLeaderboard')}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </CardFooter>
      )}

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
