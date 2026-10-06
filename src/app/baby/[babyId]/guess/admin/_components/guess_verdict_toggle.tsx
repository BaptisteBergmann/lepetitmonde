'use client'

import { KeyboardEvent, useRef, useState } from "react";
import { toast } from 'sonner'
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setGuessVerdict } from "@/utils/actions/guesses";
import { logger } from "@/utils/logger";

type Verdict = boolean | null;

const SEGMENTS: { value: Verdict; key: "auto" | "correct" | "incorrect" }[] = [
  { value: null, key: "auto" },
  { value: true, key: "correct" },
  { value: false, key: "incorrect" },
];

const ICONS = { auto: Wand2, correct: Check, incorrect: X };

export default function GuessVerdictToggle({
  babyId,
  guessId,
  userName,
  isCorrect,
}: {
  babyId: string;
  guessId: string;
  userName: string;
  isCorrect: Verdict;
}) {
  const t = useTranslations('guess.admin.verdict');
  const router = useRouter();
  const [selected, setSelected] = useState<Verdict>(isCorrect);
  const [isPending, setIsPending] = useState(false);
  const segmentRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = async (next: Verdict) => {
    if (isPending || next === selected) return;
    const contextLogger = logger.child({ function: 'GuessVerdictToggle.select', babyId, guessId });
    const previous = selected;
    // Optimistic: points refresh with router.refresh() once saved.
    setSelected(next);
    setIsPending(true);
    try {
      await setGuessVerdict(babyId, guessId, next);
      router.refresh();
    } catch (err) {
      contextLogger.error(err, "Error setting guess verdict");
      setSelected(previous);
      toast.error(err instanceof Error && err.message ? err.message : t('error'));
    } finally {
      setIsPending(false);
    }
  };

  const selectedIndex = SEGMENTS.findIndex((s) => s.value === selected);

  // Radio-group keyboard pattern: arrows move and select, one tab stop.
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1
        : 0;
    if (delta === 0) return;
    event.preventDefault();
    const nextIndex = (index + delta + SEGMENTS.length) % SEGMENTS.length;
    segmentRefs.current[nextIndex]?.focus();
    void select(SEGMENTS[nextIndex].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('label', { userName })}
      aria-busy={isPending}
      className="inline-flex gap-0.5 rounded-2xl border border-landing-border p-0.5"
    >
      {SEGMENTS.map((segment, index) => {
        const isSelected = index === selectedIndex;
        const Icon = ICONS[segment.key];
        return (
          <Button
            key={segment.key}
            ref={(el) => { segmentRefs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            size="xs"
            variant={isSelected ? (segment.value === false ? "destructive" : "default") : "ghost"}
            disabled={isPending}
            className="relative touch-target cursor-pointer"
            onClick={() => select(segment.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <Icon aria-hidden />
            {t(segment.key)}
          </Button>
        );
      })}
    </div>
  );
}
