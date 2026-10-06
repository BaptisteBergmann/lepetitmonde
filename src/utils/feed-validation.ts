// Server-side input validation shared by the feed's Server Actions. Not a
// 'use server' module, and server-only in practice (actionError resolves
// translations via next-intl/server). Client code imports FEED_LIMITS from
// feed-limits.ts instead.
import { REACTIONS } from '@utils/reactions'
import { actionError } from '@utils/actions/errors'

export { FEED_LIMITS } from '@utils/feed-limits'

// Emoji are stored and echoed into push bodies, so only the picker's own
// set is accepted.
export async function assertReactionEmoji(emoji: unknown): Promise<string> {
  if (typeof emoji !== 'string' || !REACTIONS.some((reaction) => reaction.emoji === emoji)) {
    throw await actionError('invalidReaction')
  }
  return emoji
}

// Trims, enforces `max` (in UTF-16 units, same as the inputs' maxLength) and
// optionally rejects empty text with the given serverErrors key. Empty
// optional text comes back as null so it's stored as NULL, not ''.
export async function normalizeText(value: unknown, max: number, options: { requiredKey: string }): Promise<string>
export async function normalizeText(value: unknown, max: number, options?: { requiredKey?: undefined }): Promise<string | null>
export async function normalizeText(value: unknown, max: number, options: { requiredKey?: string } = {}): Promise<string | null> {
  if (value !== null && value !== undefined && typeof value !== 'string') throw await actionError('textTooLong')

  const trimmed = (value ?? '').trim()
  if (!trimmed) {
    if (options.requiredKey) throw await actionError(options.requiredKey)
    return null
  }
  if (trimmed.length > max) throw await actionError('textTooLong')

  return trimmed
}

// Push bodies are shown in a single notification line; keep them short.
export function truncateForPush(text: string, max = 140) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
