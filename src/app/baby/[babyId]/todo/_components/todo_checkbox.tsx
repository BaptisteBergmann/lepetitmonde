'use client'

import { toast } from 'sonner'
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tables } from "@utils/supabase/database.types";
import { toggleTodoItem } from "@/utils/actions/todo";
import { cn } from "@utils/utils";

// Whole row label (checkbox + title) so tapping the text toggles too.
// While the transition is pending (action + the router.refresh() it wraps),
// show the requested state so the tap feels instant and doesn't flash back
// before the refreshed props land.
export default function TodoCheckbox({ babyId, item }: { babyId: string; item: Tables<'todo_items'> }) {
  const t = useTranslations('todo');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const done = pending ? !item.done : item.done;

  const handleToggle = () => {
    startTransition(async () => {
      try {
        await toggleTodoItem(babyId, item.id, !item.done);
        router.refresh();
      } catch (err) {
        console.error(err);
        toast.error(t('toggleError'));
      }
    });
  };

  return (
    <label className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        onChange={handleToggle}
        className="h-4 w-4 shrink-0 rounded border-landing-border accent-primary cursor-pointer"
      />
      <span className={cn("text-sm font-medium break-words", done ? "line-through text-landing-muted" : "text-landing-foreground")}>
        {item.title}
      </span>
    </label>
  );
}
