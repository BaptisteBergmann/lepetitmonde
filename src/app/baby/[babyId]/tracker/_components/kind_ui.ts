import type { Tables } from '@utils/supabase/database.types'
import { CARE_KIND_CONFIG } from '@utils/care-events'

type Translate = (key: string, values?: Record<string, string | number>) => string

// One case per kind: the detail line of a log row ("Breastfeed · Left",
// "Bottle · 120 ml"). `t` is the `tracker` translator. A new kind adds a case.
export function describeEvent(
  event: Pick<Tables<'care_events'>, 'kind' | 'breast_side' | 'amount_ml'>,
  t: Translate,
): string {
  const name = t(`kinds.${event.kind}`)
  switch (event.kind) {
    case 'breastfeed':
      return event.breast_side ? `${name} · ${t(`sides.${event.breast_side}`)}` : name
    case 'bottle':
      return `${name} · ${event.amount_ml ? t('summary.amount', { amount: event.amount_ml }) : t('log.noAmount')}`
    default:
      return name
  }
}

export function kindIcon(kind: Tables<'care_events'>['kind']) {
  return CARE_KIND_CONFIG[kind].icon
}
