import type { ReactionsData } from '@utils/actions/reactions'

// label used to live here as a literal string; it's now resolved from the
// `reactions.<key>` messages instead (see reaction_picker.tsx), so a locale
// switch doesn't need a code change here.
export const REACTIONS = [
  { emoji: '🍼', key: 'bottle' },
  { emoji: '👶', key: 'baby' },
  { emoji: '😴', key: 'sleep' },
  { emoji: '🎉', key: 'celebration' },
  { emoji: '❤️', key: 'heart' },
  { emoji: '😂', key: 'laughing' },
] as const

// Optimistic local update for "my reaction changed to `next`" (null = removed).
// Names are left alone: the refetch that follows the server call fixes them.
export function applyMyReaction(data: ReactionsData, next: string | null): ReactionsData {
  let breakdown = data.breakdown
  if (data.myEmoji) {
    breakdown = breakdown
      .map((entry) => (entry.emoji === data.myEmoji ? { ...entry, count: entry.count - 1 } : entry))
      .filter((entry) => entry.count > 0)
  }
  if (next) {
    breakdown = breakdown.some((entry) => entry.emoji === next)
      ? breakdown.map((entry) => (entry.emoji === next ? { ...entry, count: entry.count + 1 } : entry))
      : [...breakdown, { emoji: next, count: 1, names: [] }]
  }
  return { breakdown, myEmoji: next }
}
