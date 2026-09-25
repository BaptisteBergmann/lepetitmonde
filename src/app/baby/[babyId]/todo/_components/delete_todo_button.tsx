'use client'

import { useConfirm } from '@/components/confirm_provider'
import { toast } from 'sonner'
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteTodoItem } from "@/utils/actions/todo";

export default function DeleteTodoButton({ babyId, itemId }: { babyId: string; itemId: string }) {
  const t = useTranslations('todo');
  const confirmAction = useConfirm()
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!(await confirmAction(t('deleteConfirm')))) return;

    setIsDeleting(true);
    try {
      await deleteTodoItem(babyId, itemId);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(t('deleteError'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isDeleting}
      className="gap-1.5 rounded-2xl cursor-pointer text-destructive hover:text-destructive"
      onClick={handleDelete}
    >
      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      {t('delete')}
    </Button>
  );
}
