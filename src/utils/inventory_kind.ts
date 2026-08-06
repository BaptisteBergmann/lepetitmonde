import { Bath, BedDouble, Car, LucideIcon, Package, Shield, Shirt, ToyBrick, UtensilsCrossed } from 'lucide-react'
import { Enums } from '@utils/supabase/database.types'

export type ItemKind = Enums<'item_kind'>

export const ITEM_KINDS: ItemKind[] = ['clothing', 'feeding', 'bathing', 'room', 'safety', 'transport', 'toy', 'other']

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  clothing: 'Vêtement',
  feeding: 'Repas',
  bathing: 'Bain',
  room: 'Chambre',
  safety: 'Sécurité',
  transport: 'Transport',
  toy: 'Jouet',
  other: 'Autre',
}

export const ITEM_KIND_ICON: Record<ItemKind, LucideIcon> = {
  clothing: Shirt,
  feeding: UtensilsCrossed,
  bathing: Bath,
  room: BedDouble,
  safety: Shield,
  transport: Car,
  toy: ToyBrick,
  other: Package,
}
