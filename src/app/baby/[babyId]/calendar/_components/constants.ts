import { Footprints, Gem, MessageCircle, Smile, Laugh, Cake, Star, Stethoscope, LucideIcon } from 'lucide-react'
import { Enums } from '@utils/supabase/database.types'

export const CIRCLE_COLORS = [
  "bg-rose-400",
  "bg-sky-400",
  "bg-amber-400",
  "bg-emerald-400",
  "bg-violet-400",
  "bg-orange-400",
]

export const MILESTONE_ICONS: Record<Enums<'milestone_type'>, LucideIcon> = {
  first_steps: Footprints,
  first_tooth: Gem,
  first_word: MessageCircle,
  first_smile: Smile,
  first_laugh: Laugh,
  birthday: Cake,
  other: Star,
}

export const MILESTONE_LABELS: Record<Enums<'milestone_type'>, string> = {
  first_steps: "Premiers pas",
  first_tooth: "Première dent",
  first_word: "Premier mot",
  first_smile: "Premier sourire",
  first_laugh: "Premier éclat de rire",
  birthday: "Anniversaire",
  other: "Autre",
}

export const KIND_ICONS: Partial<Record<Enums<'event_kind'>, LucideIcon>> = {
  medical: Stethoscope,
}
