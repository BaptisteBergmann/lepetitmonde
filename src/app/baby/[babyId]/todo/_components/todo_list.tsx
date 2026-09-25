import { getTranslations } from "next-intl/server";
import { Pencil } from "lucide-react";
import { Tables } from "@utils/supabase/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TodoModal from "./todo_modal";
import TodoCheckbox from "./todo_checkbox";
import ReorderTodoButtons from "./reorder_todo_buttons";
import DeleteTodoButton from "./delete_todo_button";

// Flat list in position order — done items stay in place, just dimmed.
export default async function TodoList({ babyId, items }: { babyId: string; items: Tables<'todo_items'>[] }) {
  const t = await getTranslations('todo');

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-landing-muted border border-dashed border-landing-border rounded-2xl bg-landing-surface">
        <p className="text-sm font-medium">{t('empty')}</p>
        <p className="text-xs text-landing-muted mt-1">{t('emptyHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <Card key={item.id} className="border-landing-border bg-landing-surface">
          <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 min-w-0 items-center gap-3">
              <ReorderTodoButtons
                babyId={babyId}
                itemId={item.id}
                isFirst={index === 0}
                isLast={index === items.length - 1}
              />
              <TodoCheckbox babyId={babyId} item={item} />
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <TodoModal
                babyId={babyId}
                item={item}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-2xl cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('edit')}
                  </Button>
                }
              />
              <DeleteTodoButton babyId={babyId} itemId={item.id} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
