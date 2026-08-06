'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createInventoryItem, updateInventoryItem, deleteInventoryItem } from '@utils/actions/inventory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Loader2, Package, Pencil, Trash2, X } from 'lucide-react'
import { Tables, Enums } from '@utils/supabase/database.types'
import { ITEM_KINDS, ITEM_KIND_LABEL, ItemKind } from '@utils/inventory_kind'

type InventoryItem = Tables<'inventory_items'>
type Condition = Enums<'item_condition'>

const UNSPECIFIED = "unspecified"

export default function InventoryItemModal({
  babyId,
  sizes,
  sources,
  item,
  trigger,
}: {
  babyId: string
  sizes: string[]
  sources: string[]
  item?: InventoryItem
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const isEditMode = !!item
  const [open, setOpen] = useState(false)

  const [kind, setKind] = useState<ItemKind>(item?.kind ?? "clothing")
  const [size, setSize] = useState(item?.size ?? "")
  const [name, setName] = useState(item?.name ?? "")
  const [detail, setDetail] = useState(item?.detail ?? "")
  const [quantityOwned, setQuantityOwned] = useState(String(item?.quantity_owned ?? 0))
  const [quantityTarget, setQuantityTarget] = useState(item?.quantity_target != null ? String(item.quantity_target) : "")
  const [pricePaid, setPricePaid] = useState(item?.price_paid != null ? String(item.price_paid) : "")
  const [purchasedFrom, setPurchasedFrom] = useState(item?.purchased_from ?? "")
  const [condition, setCondition] = useState<string>(item?.condition ?? UNSPECIFIED)

  const [isPending, setIsPending] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const resetForm = () => {
    setKind("clothing")
    setSize("")
    setName("")
    setDetail("")
    setQuantityOwned("0")
    setQuantityTarget("")
    setPricePaid("")
    setPurchasedFrom("")
    setCondition(UNSPECIFIED)
  }

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      const payload = {
        kind,
        size: kind === "clothing" ? (size.trim() || null) : null,
        name: name.trim(),
        detail: detail.trim() || null,
        quantity_owned: Number(quantityOwned) || 0,
        quantity_target: quantityTarget === "" ? null : Number(quantityTarget),
        price_paid: pricePaid === "" ? null : Number(pricePaid),
        purchased_from: purchasedFrom.trim() || null,
        condition: condition === UNSPECIFIED ? null : (condition as Condition),
      }

      if (isEditMode) {
        await updateInventoryItem(babyId, item.id, payload)
      } else {
        await createInventoryItem({ ...payload, baby_id: babyId })
      }

      setOpen(false)
      if (!isEditMode) resetForm()
      router.refresh()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Une erreur est survenue lors de la sauvegarde.")
    } finally {
      setIsPending(false)
    }
  }

  const handleDelete = async () => {
    if (!item) return
    if (!confirm("Supprimer cet article ? Cette action est irréversible.")) return

    setIsDeleting(true)
    try {
      await deleteInventoryItem(babyId, item.id)
      setOpen(false)
      router.refresh()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Une erreur est survenue lors de la suppression.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="inline-flex">
          {trigger}
        </span>
      ) : (
        <Button onClick={() => setOpen(true)} className="gap-2 rounded-2xl cursor-pointer">
          <Plus className="h-4 w-4" />
          <span>Ajouter un article</span>
        </Button>
      )}

      {open && createPortal(
        <div
          className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-in fade-in-0 duration-200"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[460px] max-h-[90vh] bg-landing-surface text-landing-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-landing-border animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-landing-border py-4 px-5">
              <h2 className="font-display text-base font-semibold flex items-center gap-2">
                {isEditMode ? <Pencil className="h-4.5 w-4.5 text-primary" /> : <Package className="h-4.5 w-4.5 text-primary" />}
                {isEditMode ? "Modifier l'article" : "Ajouter un article"}
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
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Type d&apos;article
                  </Label>
                  <Select value={kind} onValueChange={(value: string | null) => setKind((value as ItemKind) ?? "clothing")}>
                    <SelectTrigger className="w-full text-foreground bg-input/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {ITEM_KINDS.map((k) => <SelectItem key={k} value={k}>{ITEM_KIND_LABEL[k]}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {kind === "clothing" && (
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <Label htmlFor="size" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Taille (facultatif)
                    </Label>
                    <Input
                      id="size"
                      list="inventory-sizes"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      placeholder="Ex: 0/3 mois"
                    />
                    <datalist id="inventory-sizes">
                      {sizes.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                )}

                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Article
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Bonnet"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label htmlFor="detail" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Détail (facultatif)
                  </Label>
                  <Input
                    id="detail"
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    placeholder="Ex: taille unique"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quantity_owned" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Quantité possédée
                  </Label>
                  <Input
                    id="quantity_owned"
                    type="number"
                    min={0}
                    value={quantityOwned}
                    onChange={(e) => setQuantityOwned(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quantity_target" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Quantité souhaitée
                  </Label>
                  <Input
                    id="quantity_target"
                    type="number"
                    min={0}
                    value={quantityTarget}
                    onChange={(e) => setQuantityTarget(e.target.value)}
                    placeholder="Facultatif"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="price_paid" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Prix payé (€)
                  </Label>
                  <Input
                    id="price_paid"
                    type="number"
                    min={0}
                    step={0.01}
                    value={pricePaid}
                    onChange={(e) => setPricePaid(e.target.value)}
                    placeholder="Facultatif"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    État
                  </Label>
                  <Select value={condition} onValueChange={(value: string | null) => setCondition(value ?? UNSPECIFIED)}>
                    <SelectTrigger className="w-full text-foreground bg-input/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={UNSPECIFIED}>Non précisé</SelectItem>
                        <SelectItem value="new">Neuf</SelectItem>
                        <SelectItem value="secondhand">Occasion</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label htmlFor="purchased_from" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Acheté chez / via (facultatif)
                  </Label>
                  <Input
                    id="purchased_from"
                    list="inventory-sources"
                    value={purchasedFrom}
                    onChange={(e) => setPurchasedFrom(e.target.value)}
                    placeholder="Ex: Vinted, Kiabi, Cadeau de mamie"
                  />
                  <datalist id="inventory-sources">
                    {sources.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-landing-border bg-landing-background flex justify-between gap-2 items-center px-5 py-3.5">
              {isEditMode ? (
                <Button
                  variant="outline"
                  disabled={isDeleting || isPending}
                  className="rounded-2xl cursor-pointer text-destructive hover:text-destructive"
                  onClick={handleDelete}
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  <span>Supprimer</span>
                </Button>
              ) : <span />}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="rounded-2xl cursor-pointer"
                  onClick={() => setOpen(false)}
                >
                  Annuler
                </Button>
                <Button
                  disabled={!name.trim() || isPending || isDeleting}
                  className="rounded-2xl cursor-pointer"
                  onClick={handleConfirm}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{isEditMode ? "Enregistrement..." : "Ajout..."}</span>
                    </>
                  ) : (
                    <span>{isEditMode ? "Enregistrer" : "Ajouter"}</span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
