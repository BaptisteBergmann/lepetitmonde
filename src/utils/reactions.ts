// label used to live here as a literal string; it's now resolved from the
// `reactions.<key>` messages instead (see reaction_picker.tsx), so a locale
// switch doesn't need a code change here.
export const REACTIONS = [
  { emoji: '🍼', key: 'bottle' },
  { emoji: '👶', key: 'baby' },
  { emoji: '😴', key: 'sleep' },
  { emoji: '🎉', key: 'celebration' },
  { emoji: '❤️', key: 'heart' },
] as const
