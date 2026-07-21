'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addQuestion } from '@utils/actions/guesses_questions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, Calendar, Hash, Type, HelpCircle, X } from 'lucide-react';

export default function Modal({ babyId: propBabyId }: { babyId?: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const babyId = propBabyId || searchParams.get('babyId') || "XXX"
  const [open, setOpen] = useState(false)
  const [selectValue, setSelectValue] = useState("");

  // Nouveaux états pour la question de pronostic
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [isPending, setIsPending] = useState(false)

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      const result = await addQuestion({
        title,
        description,
        type: selectValue,
        is_active: true,
        baby_id: babyId,
      })

      if (!result.error) {
        setOpen(false) // Fermer le modal si tout est OK
        setTitle("")
        setDescription("")
        setSelectValue("")
        router.refresh()
      } else {
        alert("Une erreur est survenue lors de la sauvegarde.")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsPending(false)
    }
  }

  const items = [
    { label: "Texte", value: "text" },
    { label: "Date", value: "date" },
    { label: "Nombre", value: "number" },
  ]

  // Fonction de nettoyage lors du changement de type
  const handleTypeChange = (value: string | null) => {
    if (value) setSelectValue(value);
  };

  return (
    <div>
      <Button
        onClick={() => setOpen(true)}
        className="gap-2 rounded-2xl cursor-pointer"
      >
        <Plus className="h-4 w-4" />
        <span>Nouveau pronostic</span>
      </Button>

      {open && (
        <div className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-in fade-in-0 duration-200">
          <div className="w-full max-w-[460px] max-h-[90vh] bg-card text-card-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-border animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-border py-4 px-5">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <HelpCircle className="h-4.5 w-4.5 text-primary" />
                Créer un nouveau pronostic
              </h2>
              <button 
                onClick={() => setOpen(false)}
                className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 flex-1 overflow-y-auto text-card-foreground">

              {/* Champ Titre */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Titre du pronostic
                </Label>
                <Input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Devinez le prénom du bébé !"
                  required
                />
              </div>

              {/* Champ Description */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description (facultative)
                </Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ajoutez des indices ou des détails pour la famille..."
                  rows={3}
                  className="w-full border border-transparent bg-input/50 rounded-2xl p-3 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground resize-none transition-[color,box-shadow] duration-200"
                />
              </div>

              {/* Sélecteur du Type de Réponse attendu */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Type de réponse attendu
                </Label>
                <Select value={selectValue} onValueChange={handleTypeChange}>
                  <SelectTrigger className="w-full text-foreground bg-input/50">
                    <SelectValue placeholder="Sélectionner le type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          <div className="flex items-center gap-2">
                            {item.value === "date" && <Calendar className="h-3.5 w-3.5 text-primary" />}
                            {item.value === "number" && <Hash className="h-3.5 w-3.5 text-rose" />}
                            {item.value === "text" && <Type className="h-3.5 w-3.5 text-emerald-500" />}
                            <span>{item.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="border-t border-border bg-muted/20 flex justify-end gap-2 items-center px-5 py-3.5">
              <Button
                variant="outline"
                className="rounded-2xl cursor-pointer"
                onClick={() => setOpen(false)}
              >
                Annuler
              </Button>
              <Button
                disabled={!title.trim() || !selectValue || isPending}
                className="rounded-2xl cursor-pointer"
                onClick={handleConfirm}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Création...</span>
                  </>
                ) : (
                  <span>Confirmer</span>
                )}
              </Button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
