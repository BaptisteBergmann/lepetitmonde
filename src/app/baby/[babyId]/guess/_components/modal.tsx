'use client'

import { toast } from 'sonner'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addQuestion, updateQuestion } from '@utils/actions/guesses_questions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, Calendar, Hash, Type, CircleDot, HelpCircle, X } from 'lucide-react';
import { Tables } from '@utils/supabase/database.types';

type GuessQuestion = Tables<'guess_questions'>;

export default function Modal({
  babyId: propBabyId,
  isAdmin = false,
  question,
  trigger,
  lockStructure = false,
}: {
  babyId?: string;
  isAdmin?: boolean;
  question?: GuessQuestion;
  trigger?: React.ReactNode;
  /** When true (a question that already has answers), the answer type and its
   * options can't be changed — only the title/description are editable —
   * since existing answers depend on that structure staying stable. */
  lockStructure?: boolean;
}) {
  const t = useTranslations('guess.form')
  const tType = useTranslations('guess.answerTypes')
  const searchParams = useSearchParams()
  const router = useRouter()
  const babyId = propBabyId || question?.baby_id || searchParams.get('babyId') || "XXX"
  const isEditMode = !!question
  const [open, setOpen] = useState(false)
  // Non-admins only propose a question; the answer type is picked later by an admin.
  const [selectValue, setSelectValue] = useState(question?.type ?? (isAdmin ? "" : "text"));

  // Nouveaux états pour la question de pronostic
  const [title, setTitle] = useState(question?.title ?? "");
  const [description, setDescription] = useState(question?.description ?? "");
  const initialOptions = (question?.options as { choices?: string[]; min?: number; max?: number; precision?: number; defaultMonth?: string; highlightedDate?: string } | null) ?? null;
  const [choices, setChoices] = useState<string[]>(
    initialOptions?.choices && initialOptions.choices.length > 0 ? initialOptions.choices : ["", ""]
  );
  const [minValue, setMinValue] = useState<string>(
    initialOptions?.min !== undefined && initialOptions?.min !== null ? String(initialOptions.min) : ""
  );
  const [maxValue, setMaxValue] = useState<string>(
    initialOptions?.max !== undefined && initialOptions?.max !== null ? String(initialOptions.max) : ""
  );
  const [precision, setPrecision] = useState<string>(
    initialOptions?.precision !== undefined && initialOptions?.precision !== null ? String(initialOptions.precision) : "2"
  );
  const [defaultMonth, setDefaultMonth] = useState<string>(initialOptions?.defaultMonth ?? "");
  const [highlightedDate, setHighlightedDate] = useState<string>(initialOptions?.highlightedDate ?? "");

  const [isPending, setIsPending] = useState(false)

  const validChoices = choices.map((c) => c.trim()).filter(Boolean);
  const isOptionType = selectValue === "option";
  const isNumberType = selectValue === "number";
  const isDateType = selectValue === "date";

  const buildOptions = () => {
    if (isOptionType) return { choices: validChoices }
    if (isNumberType) {
      return {
        min: minValue === "" ? null : Number(minValue),
        max: maxValue === "" ? null : Number(maxValue),
        precision: Number(precision),
      }
    }
    if (isDateType) {
      return {
        defaultMonth: defaultMonth || null,
        highlightedDate: highlightedDate || null,
      }
    }
    return null
  }

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      const payload = {
        title,
        description,
        type: selectValue,
        options: buildOptions(),
        is_active: question?.is_active ?? true,
        baby_id: babyId,
      }

      if (isEditMode) {
        await updateQuestion(babyId, question.id, payload)
      } else {
        const result = await addQuestion(payload)
        if (result.error) throw result.error
      }

      setOpen(false) // Fermer le modal si tout est OK
      if (!isEditMode) {
        setTitle("")
        setDescription("")
        setSelectValue(isAdmin ? "" : "text")
        setChoices(["", ""])
        setMinValue("")
        setMaxValue("")
        setPrecision("2")
        setDefaultMonth("")
        setHighlightedDate("")
      }
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : t('saveError'))
    } finally {
      setIsPending(false)
    }
  }

  const items = [
    { label: tType('text'), value: "text" },
    { label: tType('date'), value: "date" },
    { label: tType('number'), value: "number" },
    { label: tType('option'), value: "option" },
  ]

  // Fonction de nettoyage lors du changement de type
  const handleTypeChange = (value: string | null) => {
    if (value) setSelectValue(value);
  };

  const handleChoiceChange = (index: number, value: string) => {
    setChoices((prev) => prev.map((c, i) => (i === index ? value : c)));
  };

  const handleAddChoice = () => {
    setChoices((prev) => [...prev, ""]);
  };

  const handleRemoveChoice = (index: number) => {
    setChoices((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="inline-flex">
          {trigger}
        </span>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          className="gap-2 rounded-2xl cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>{isAdmin ? t('newAdmin') : t('proposeGuest')}</span>
        </Button>
      )}

      {open && createPortal(
        <div
          className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-[60] p-4 animate-in fade-in-0 duration-200"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[460px] max-h-[90vh] bg-landing-surface text-landing-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-landing-border animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >

            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-landing-border py-4 px-5">
              <h2 className="font-display text-base font-semibold flex items-center gap-2">
                <HelpCircle className="h-4.5 w-4.5 text-primary" />
                {isEditMode ? t('editTitle') : isAdmin ? t('newAdminTitle') : t('proposeTitle')}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 flex-1 overflow-y-auto">

              {!isAdmin && (
                <p className="text-xs text-landing-muted bg-landing-background rounded-2xl px-3 py-2">
                  {t('nonAdminNotice')}
                </p>
              )}

              {/* Champ Titre */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('titleLabel')}
                </Label>
                <Input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('titlePlaceholder')}
                  required
                />
              </div>

              {/* Champ Description */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('descriptionLabel')}
                </Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                  className="w-full border border-transparent bg-input/50 rounded-2xl p-3 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground resize-none transition-[color,box-shadow] duration-200"
                />
              </div>

              {lockStructure && (
                <p className="text-xs text-landing-muted bg-landing-background rounded-2xl px-3 py-2">
                  {t('lockStructureNotice')}
                </p>
              )}

              {/* Sélecteur du Type de Réponse attendu (réservé à l'admin : les propositions sont typées lors de la validation) */}
              {isAdmin && !lockStructure && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('answerTypeLabel')}
                  </Label>
                  <Select value={selectValue} onValueChange={handleTypeChange}>
                    <SelectTrigger className="w-full text-foreground bg-input/50">
                      <SelectValue placeholder={t('answerTypePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {items.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            <div className="flex items-center gap-2">
                              {item.value === "date" && <Calendar className="h-3.5 w-3.5 text-primary" />}
                              {item.value === "number" && <Hash className="h-3.5 w-3.5 text-rose" />}
                              {item.value === "text" && <Type className="h-3.5 w-3.5 text-emerald-500" />}
                              {item.value === "option" && <CircleDot className="h-3.5 w-3.5 text-violet-500" />}
                              <span>{item.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Options prédéfinies (uniquement pour le type "Choix unique") */}
              {isAdmin && !lockStructure && isOptionType && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('choicesLabel')}
                  </Label>
                  <div className="flex flex-col gap-2">
                    {choices.map((choice, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={choice}
                          onChange={(e) => handleChoiceChange(index, e.target.value)}
                          placeholder={t('choicePlaceholder', { number: index + 1 })}
                          className="flex-1"
                        />
                        <button
                          onClick={() => handleRemoveChoice(index)}
                          disabled={choices.length <= 2}
                          className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start gap-1.5 rounded-2xl cursor-pointer mt-1"
                    onClick={handleAddChoice}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{t('addChoice')}</span>
                  </Button>
                </div>
              )}

              {/* Étalonnage (uniquement pour le type "Nombre") */}
              {isAdmin && !lockStructure && isNumberType && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="min" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('minLabel')}
                      </Label>
                      <Input
                        type="number"
                        id="min"
                        value={minValue}
                        onChange={(e) => setMinValue(e.target.value)}
                        placeholder={t('minPlaceholder')}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="max" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('maxLabel')}
                      </Label>
                      <Input
                        type="number"
                        id="max"
                        value={maxValue}
                        onChange={(e) => setMaxValue(e.target.value)}
                        placeholder={t('maxPlaceholder')}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('precisionLabel')}
                    </Label>
                    <Select value={precision} onValueChange={(v) => v && setPrecision(v)}>
                      <SelectTrigger className="w-full text-foreground bg-input/50">
                        <SelectValue placeholder={t('precisionPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="0">{t('precision0')}</SelectItem>
                          <SelectItem value="1">{t('precision1')}</SelectItem>
                          <SelectItem value="2">{t('precision2')}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Réglages du calendrier (uniquement pour le type "Date") */}
              {isAdmin && !lockStructure && isDateType && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="defaultMonth" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('defaultMonthLabel')}
                    </Label>
                    <Input
                      type="month"
                      id="defaultMonth"
                      value={defaultMonth}
                      onChange={(e) => setDefaultMonth(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="highlightedDate" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('highlightedDateLabel')}
                    </Label>
                    <Input
                      type="date"
                      id="highlightedDate"
                      value={highlightedDate}
                      onChange={(e) => setHighlightedDate(e.target.value)}
                    />
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
              <Button
                variant="outline"
                className="rounded-2xl cursor-pointer"
                onClick={() => setOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                disabled={
                  !title.trim() ||
                  (isAdmin && !selectValue) ||
                  (isAdmin && isOptionType && validChoices.length < 2) ||
                  (isAdmin && isNumberType && (minValue === "" || maxValue === "" || Number(minValue) >= Number(maxValue))) ||
                  isPending
                }
                className="rounded-2xl cursor-pointer"
                onClick={handleConfirm}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isEditMode ? t('saving') : t('creating')}</span>
                  </>
                ) : (
                  <span>{isEditMode ? t('save') : t('confirm')}</span>
                )}
              </Button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
