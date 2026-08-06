import { Bath, BedDouble, Car, LucideIcon, Package, Shield, Shirt, ToyBrick, UtensilsCrossed } from 'lucide-react'

// kind is free text (families can add their own article types), not a fixed
// enum — these are just the built-in suggestions offered in the datalist.
export type ItemKind = string

export const DEFAULT_ITEM_KINDS = ['Vêtement', 'Repas', 'Bain', 'Chambre', 'Sécurité', 'Transport', 'Jouet', 'Autre']

const DEFAULT_ITEM_KIND_ICONS: Record<string, LucideIcon> = {
  'Vêtement': Shirt,
  'Repas': UtensilsCrossed,
  'Bain': Bath,
  'Chambre': BedDouble,
  'Sécurité': Shield,
  'Transport': Car,
  'Jouet': ToyBrick,
  'Autre': Package,
}

export function getItemKindIcon(kind: string): LucideIcon {
  return DEFAULT_ITEM_KIND_ICONS[kind] ?? Package
}

// Sorts the built-in kinds in their defined order first, then any custom
// kind a family added, alphabetically.
export function compareItemKinds(a: string, b: string) {
  const ai = DEFAULT_ITEM_KINDS.indexOf(a)
  const bi = DEFAULT_ITEM_KINDS.indexOf(b)
  if (ai !== -1 && bi !== -1) return ai - bi
  if (ai !== -1) return -1
  if (bi !== -1) return 1
  return a.localeCompare(b, "fr")
}
