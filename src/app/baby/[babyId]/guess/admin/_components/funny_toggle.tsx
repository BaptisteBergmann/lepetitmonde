'use client'

import { useState } from "react";
import { toast } from 'sonner'
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Laugh } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setGuessFunny } from "@/utils/actions/guesses";
import { logger } from "@/utils/logger";
import { cn } from "@utils/utils";

export default function FunnyToggle({
  babyId,
  guessId,
  userName,
  isFunny,
}: {
  babyId: string;
  guessId: string;
  userName: string;
  isFunny: boolean;
}) {
  const t = useTranslations('guess.admin.funny');
  const router = useRouter();
  const [pressed, setPressed] = useState(isFunny);
  const [isPending, setIsPending] = useState(false);

  const toggle = async () => {
    const contextLogger = logger.child({ function: 'FunnyToggle.toggle', babyId, guessId });
    const next = !pressed;
    // Optimistic; the pill appearing after refresh is the only feedback.
    setPressed(next);
    setIsPending(true);
    try {
      await setGuessFunny(babyId, guessId, next);
      router.refresh();
    } catch (err) {
      contextLogger.error(err, "Error setting funny flag");
      setPressed(!next);
      toast.error(t('error'));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-pressed={pressed}
      disabled={isPending}
      onClick={toggle}
      className={cn(
        "relative touch-target cursor-pointer",
        pressed ? "bg-rose/15 text-rose hover:bg-rose/20 hover:text-rose" : "text-landing-muted"
      )}
    >
      <Laugh className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{pressed ? t('unflag', { userName }) : t('flag', { userName })}</span>
    </Button>
  );
}
