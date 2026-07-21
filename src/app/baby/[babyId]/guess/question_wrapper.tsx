"use client";

import { Button } from "@/components/ui/button";
import { submitGuess } from "@/utils/actions/guesses";
import { logger } from "@/utils/logger";
import { Tables } from "@/utils/supabase/database.types";
import { useState, Dispatch } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { CheckCircle2, Send, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import CalendarPicker from "./_components/picker/date";
import NumberPicker from "./_components/picker/number";
import TextPicker from "./_components/picker/text";
import TimePicker from "./_components/picker/time";
import OptionPicker from "./_components/picker/option";

export interface PickerProps {
  value: number | string | Date | undefined;
  options: any;
  onChange: Dispatch<any> | undefined;
  id: string;
}

export type QuestionWithGuess = Tables<"guess_questions"> & {
  guesses?: Tables<"guesses">[];
};

export default function QuestionWrapper({ questionWithGuess }: { questionWithGuess: QuestionWithGuess }) {
  const contextLogger = logger.child({ function: QuestionWrapper.name });
  contextLogger.info(questionWithGuess, "Display question");

  const router = useRouter();
  const [value, setValue] = useState(
    // Non pré-rempli pour "date" : le Calendar attend un `Date | undefined`, jamais une chaîne vide.
    questionWithGuess.type === "date" ? undefined : ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasAnswered = !!questionWithGuess.guesses && questionWithGuess.guesses.length > 0;

  const handleSend = async () => {
    if (value === undefined || value === null || value === "") return;
    setIsSubmitting(true);
    try {
      await submitGuess({
        baby_id: questionWithGuess.baby_id,
        answer: value,
        question_id: questionWithGuess.id,
      });
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de l'envoi de votre pronostic.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDisplayValue = (val: any, type: string) => {
    if (val === undefined || val === null || val === "") return "-";
    if (type === "date") {
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
        }
      } catch (_) { }
    }
    return String(val);
  };

  return (
    <Card className={`relative overflow-hidden transition-all duration-200 border ${hasAnswered
      ? "border-emerald-100 dark:border-emerald-950 bg-emerald-500/5 dark:bg-emerald-500/[0.02]"
      : "border-border"
      }`}>
      <CardHeader className="pb-3 pt-5">
        <CardTitle className="text-base font-bold text-foreground">
          {questionWithGuess.title}
        </CardTitle>
        {questionWithGuess.description && (
          <CardDescription className="text-xs text-muted-foreground mt-1">
            {questionWithGuess.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="pb-4">
        {hasAnswered ? (
          <div className="bg-emerald-500/10 dark:bg-emerald-500/[0.05] border border-emerald-500/20 dark:border-emerald-500/10 rounded-2xl p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
                Votre réponse
              </span>
              <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                {formatDisplayValue(questionWithGuess.guesses?.at(0)?.answer, questionWithGuess.type)}
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
                  options={questionWithGuess.options}
                  value={value}
                  onChange={setValue}
                />
              )}
              {questionWithGuess.type === "number" && (
                <NumberPicker
                  id={questionWithGuess.id}
                  options={questionWithGuess.options}
                  value={value}
                  onChange={setValue}
                />
              )}
              {questionWithGuess.type === "text" && (
                <TextPicker
                  id={questionWithGuess.id}
                  options={questionWithGuess.options}
                  value={value}
                  onChange={setValue}
                />
              )}
              {questionWithGuess.type === "time" && (
                <TimePicker
                  id={questionWithGuess.id}
                  options={questionWithGuess.options}
                  value={value}
                  onChange={setValue}
                />
              )}
              {questionWithGuess.type === "option" && (
                <OptionPicker
                  id={questionWithGuess.id}
                  options={questionWithGuess.options}
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
                <span>Envoi en cours...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Valider mon pronostic</span>
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
