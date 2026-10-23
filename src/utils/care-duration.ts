import { splitDuration } from '@utils/care-time'

type DurationTranslator = (key: 'hm' | 'h' | 'm', values: { h: number; m: number }) => string

// Minute precision on purpose: seconds flicker is stressful at night.
// `t` is the `tracker.duration` translator.
export function formatDuration(ms: number, t: DurationTranslator): string {
  const { h, m } = splitDuration(ms)
  if (h > 0 && m > 0) return t('hm', { h, m })
  if (h > 0) return t('h', { h, m })
  return t('m', { h, m })
}
