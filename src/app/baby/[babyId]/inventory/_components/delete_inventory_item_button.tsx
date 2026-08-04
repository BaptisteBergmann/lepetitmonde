'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteInventoryItem } from "@/utils/actions/inventory";

export default function DeleteInventoryItemButton({ babyId, itemId }: { babyId: string; itemId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Supprimer cet article ? Cette action est irréversible.")) return;

    setIsDeleting(true);
    try {
      await deleteInventoryItem(babyId, itemId);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de la suppression.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={isDeleting}
      className="h-7 w-7 rounded-lg cursor-pointer text-destructive hover:text-destructive"
      onClick={handleDelete}
      aria-label="Supprimer l'article"
    >
      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </Button>
  );
}
