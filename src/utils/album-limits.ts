// Limits shared by the album Server Actions and their client forms. Kept in a
// dependency-free module so inputs can set matching `maxLength` / `maxFiles`.
export const ALBUM_LIMITS = {
  name: 100,
  filesPerUpload: 30,
} as const

export const SHARE_DURATIONS_HOURS = {
  '24h': 24,
  '7d': 168,
  '30d': 720,
} as const
