'use client'

import { useState } from "react";
import { toast } from 'sonner'
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Lock, Pencil, RotateCcw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resolveQuestion, unresolveQuestion } from "@/utils/actions/guesses_questions";
import { getLocaleTag } from "@/utils/formatting";
import { formatAnswer } from "@/utils/guess_format";
import { logger } from "@/utils/logger";
import { Tables } from "@/utils/supabase/database.types";
import { QuestionOptions } from "../../question_wrapper";
import CalendarPicker from "../../_components/picker/date";
import NumberPicker from "../../_components/picker/number";
import TextPicker from "../../_components/picker/text";
import TimePicker from "../../_components/picker/time";
import OptionPicker from "../../_components/picker/option";

type PickerValue = number | string | Date | undefined;

type ResolvableQuestion = Pick<
  Tables<"guess_questions">,
  "id" | "title" | "type" | "options" | "correct_answer" | "resolved_at"
>;

function initialValue(question: ResolvableQuestion, prefill: boolean): PickerValue {
  const current = question.correct_answer;
  if (!prefill || current === null || current === undefined) {
    // The Calendar expects `Date | undefined`, never an empty string.
    return question.type === "date" ? undefined : "";
  }
  if (question.type === "date") {
    const d = new Date(current as string);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return typeof current === "number" ? String(current) : typeof current === "string" ? current : "";
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function ResolveQuestionForm({
  babyId,
  question,
}: {
  babyId: string;
  question: ResolvableQuestion;
}) {
  const t = useTranslations('guess.admin.resolve');
  const localeTag = getLocaleTag(useLocale());
  const router = useRouter();
  const isResolved = !!question.resolved_at;

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<PickerValue>(() => initialValue(question, isResolved));
  const [isSaving, setIsSaving] = useState(false);

  const questionOptions = question.options as QuestionOptions | null;
  const pickerId = `resolve-${question.id}`;
  const labelId = `${pickerId}-label`;
  const isEmpty = value === undefined || value === null || value === "";

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return;
    // Change mode starts from the stored answer; a first resolve starts empty.
    if (next) setValue(initialValue(question, isResolved));
    setOpen(next);
  };

  const handleSave = async () => {
    if (isEmpty) return;
    const contextLogger = logger.child({ function: 'ResolveQuestionForm.handleSave', babyId, questionId: question.id });
    setIsSaving(true);
    try {
      await resolveQuestion(babyId, question.id, value instanceof Date ? value.toISOString() : value);
      setOpen(false);
      toast.success(t('success'));
      router.refresh();
    } catch (err) {
      contextLogger.error(err, "Error resolving question");
      toast.error(errorMessage(err, t('error')));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReopen = async () => {
    const contextLogger = logger.child({ function: 'ResolveQuestionForm.handleReopen', babyId, questionId: question.id });
    try {
      await unresolveQuestion(babyId, question.id);
      toast.success(t('reopened'));
      router.refresh();
    } catch (err) {
      contextLogger.error(err, "Error re-opening question");
      toast.error(errorMessage(err, t('error')));
      // Keeps the confirm dialog open.
      throw err;
    }
  };

  // The same pickers members use, so the admin enters the answer in the
  // exact shape guesses are stored in. Disabled while saving.
  const onChange = isSaving ? undefined : setValue;
  const pickerProps = { id: pickerId, options: questionOptions, value, onChange };

  const dialog = (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          isResolved ? (
            <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5 rounded-2xl cursor-pointer">
              <Pencil className="h-3.5 w-3.5" />
              {t('change')}
            </Button>
          ) : (
            <Button type="button" variant="default" size="lg" className="gap-2 rounded-2xl cursor-pointer w-full sm:w-auto">
              <Target className="h-4 w-4" />
              {t('setAnswer')}
            </Button>
          )
        }
      />
      <DialogContent className="gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold">{t('dialogTitle')}</DialogTitle>
          {question.title && <DialogDescription>{question.title}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {question.type === "text" || question.type === "number" ? (
            <label id={labelId} htmlFor={pickerId} className="text-sm font-medium">
              {t('correctAnswer')}
            </label>
          ) : (
            <span id={labelId} className="text-sm font-medium">
              {t('correctAnswer')}
            </span>
          )}
          <div role="group" aria-labelledby={labelId}>
            {question.type === "date" && <CalendarPicker {...pickerProps} />}
            {question.type === "number" && <NumberPicker {...pickerProps} />}
            {question.type === "text" && <TextPicker {...pickerProps} />}
            {question.type === "time" && <TimePicker {...pickerProps} />}
            {question.type === "option" && <OptionPicker {...pickerProps} />}
          </div>
        </div>

        <p className="flex gap-2 rounded-xl bg-landing-background px-3 py-2 text-xs text-landing-muted">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{isResolved ? t('changeNotice') : t('closeNotice')}</span>
        </p>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-2xl cursor-pointer"
            disabled={isSaving}
            onClick={() => handleOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 rounded-2xl cursor-pointer"
            disabled={isEmpty || isSaving}
            onClick={handleSave}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('saving')}
              </>
            ) : isResolved ? t('saveChange') : t('save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!isResolved) return <div className="mb-3">{dialog}</div>;

  const resolvedOn = new Date(question.resolved_at as string).toLocaleDateString(localeTag, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mb-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 dark:bg-emerald-500/[0.05]">
      <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
        {t('correctAnswer')}
      </span>
      <p className="text-lg font-extrabold text-emerald-700 break-words dark:text-emerald-300">
        {formatAnswer(question.correct_answer, question.type, question.options, localeTag)}
      </p>
      <p className="text-xs text-landing-muted">{t('resolvedOn', { date: resolvedOn })}</p>
      {dialog}
      <div className="mt-2 flex justify-end">
        <ConfirmDialog
          title={t('reopenConfirmTitle')}
          description={t('reopenConfirmDescription')}
          confirmLabel={t('reopenConfirm')}
          cancelLabel={t('cancel')}
          onConfirm={handleReopen}
          trigger={
            <Button
              type="button"
              variant="link"
              size="xs"
              className="relative touch-target text-landing-muted hover:text-landing-foreground cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              {t('reopen')}
            </Button>
          }
        />
      </div>
    </div>
  );
}
