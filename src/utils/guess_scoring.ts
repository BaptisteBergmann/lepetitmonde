import { Tables, Json } from './supabase/database.types'

export type Winner = { userId: string; points: 1 | 2 }

type ScorableQuestion = Pick<Tables<'guess_questions'>, 'type'> & { correct_answer: Json }
type ScorableGuess = Pick<Tables<'guesses'>, 'user_id' | 'answer'>

// Mirrors the per-type parsing already done for display in question_wrapper.tsx
// and admin/page.tsx, but returns a value that can be compared/subtracted
// instead of formatted for display.
function toComparable(type: string, value: Json | null | undefined): number | string | null {
  if (value === null || value === undefined || value === '') return null

  if (type === 'number') {
    const num = Number(value)
    return isNaN(num) ? null : num
  }

  if (type === 'date') {
    const date = new Date(value as string | number)
    return isNaN(date.getTime()) ? null : date.getTime()
  }

  if (type === 'time') {
    const [hours, minutes] = String(value).split(':').map(Number)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
    return hours * 60 + minutes
  }

  if (type === 'text') return String(value).trim().toLowerCase()

  // 'option': compared as-is, exact match against one of the question's choices.
  return String(value)
}

// Exact match = 2pts. For number/date/time, if nobody is exactly right, the
// closest guess(es) get 1pt instead (ties all win). text/option only ever
// score on an exact match.
export function computeWinners(question: ScorableQuestion, guesses: ScorableGuess[]): Winner[] {
  const correct = toComparable(question.type, question.correct_answer)
  if (correct === null || guesses.length === 0) return []

  const candidates = guesses
    .map((guess) => ({ userId: guess.user_id, value: toComparable(question.type, guess.answer) }))
    .filter((candidate): candidate is { userId: string; value: number | string } => candidate.value !== null)

  const exactMatches = candidates.filter((candidate) => candidate.value === correct)
  if (exactMatches.length > 0) {
    return exactMatches.map((candidate) => ({ userId: candidate.userId, points: 2 }))
  }

  if (question.type === 'text' || question.type === 'option') return []

  const distances = candidates.map((candidate) => ({
    userId: candidate.userId,
    distance: Math.abs((candidate.value as number) - (correct as number)),
  }))
  if (distances.length === 0) return []

  const minDistance = Math.min(...distances.map((candidate) => candidate.distance))
  return distances
    .filter((candidate) => candidate.distance === minDistance)
    .map((candidate) => ({ userId: candidate.userId, points: 1 }))
}
