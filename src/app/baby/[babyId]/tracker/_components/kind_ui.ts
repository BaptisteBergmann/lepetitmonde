import type { Tables } from '@utils/supabase/database.types'
import { CARE_KIND_CONFIG } from '@utils/care-events'

type Translate = (key: string, values?: Record<string, string | number>) => string

// One case per kind: the detail line of a log row ("Breastfeed · Left",
// "Bottle · 120 ml"). `t` is the `tracker` translator. A new kind adds a case.
// "Pee", "Poop" or "Pee and poop".
export function diaperContents(event: Pick<Tables<'care_events'>, 'pee' | 'poop'>, t: Translate): string {
  return event.pee && event.poop ? t('diaper.bothLong') : event.poop ? t('diaper.poop') : t('diaper.pee')
}

export function describeEvent(
  event: Pick<Tables<'care_events'>, 'kind' | 'breast_side' | 'amount_ml' | 'pee' | 'poop' | 'poop_color' | 'poop_texture'>,
  t: Translate,
): string {
  const name = t(`kinds.${event.kind}`)
  switch (event.kind) {
    case 'breastfeed':
      return event.breast_side ? `${name} · ${t(`sides.${event.breast_side}`)}` : name
    case 'bottle':
      return `${name} · ${event.amount_ml ? t('summary.amount', { amount: event.amount_ml }) : t('log.noAmount')}`
    case 'diaper': {
      return [
        name,
        diaperContents(event, t),
        event.poop_color && t(`diaper.colors.${event.poop_color}`),
        event.poop_texture && t(`diaper.textures.${event.poop_texture}`),
      ].filter(Boolean).join(' · ')
    }
    default:
      return name
  }
}

export function kindIcon(kind: Tables<'care_events'>['kind']) {
  return CARE_KIND_CONFIG[kind].icon
}
