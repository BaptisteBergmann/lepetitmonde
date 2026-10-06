import type { Json, Tables } from '@utils/supabase/database.types'

// Pronostic scoring, computed at read time (nothing stored) so deleting a
// guess or overriding a verdict can never leave stale points behind.
// Rules: see .claude/plans/guess-validation-leaderboard.md, assumption 2.
export const POINTS_EXACT = 3
export const PODIUM_POINTS = [3, 2, 1]

const CLOSEST_WINS_TYPES = new Set(['number', 'date', 'time'])

const DAY_MS = 86_400_000
const MINUTES_PER_DAY = 1440
// Enough to absorb float error (|3.1 - 3.2| vs |3.3 - 3.2|) without merging
// genuinely different guesses.
const DISTANCE_PRECISION = 1e6

export type ScorableQuestion = Pick<Tables<'guess_questions'>, 'id' | 'type' | 'correct_answer' | 'resolved_at'>
export type ScorableGuess = Pick<Tables<'guesses'>, 'id' | 'user_id' | 'question_id' | 'answer' | 'is_correct' | 'is_funny'>

export type GuessScore = {
  points: number
  isCorrect: boolean
  // Competition rank (1, 1, 3) among parseable guesses; closest-wins types only.
  rank?: number
}

export type Standing = {
  userId: string
  name: string
  points: number
  correctCount: number
  podiumCount: number
  funnyCount: number
  rank: number
}

export function isClosestWinsType(type: string) {
  return CLOSEST_WINS_TYPES.has(type)
}

export function normalizeText(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function toComparable(type: string, value: Json | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' && typeof value !== 'number') return null
  // Number("") is 0, which would silently rank an empty answer.
  if (typeof value === 'string' && value.trim() === '') return null

  switch (type) {
    case 'number': {
      const n = Number(value)
      return Number.isFinite(n) ? n : null
    }
    case 'date': {
      // Whole days: dates are stored as the UTC instant of a local midnight,
      // so raw ms would differ by an hour across DST or between timezones.
      const ms = new Date(value).getTime()
      return Number.isFinite(ms) ? Math.round(ms / DAY_MS) : null
    }
    case 'time': {
      const match = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim())
      if (!match) return null
      const hours = Number(match[1])
      const minutes = Number(match[2])
      if (hours > 23 || minutes > 59) return null
      return hours * 60 + minutes
    }
    default:
      return null
  }
}

function textOf(value: Json | undefined) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function distanceBetween(type: string, value: number, target: number) {
  let distance = Math.abs(value - target)
  // 23:50 vs 00:10 is 20 minutes apart, not 23h40.
  if (type === 'time') distance = Math.min(distance, MINUTES_PER_DAY - distance)
  return Math.round(distance * DISTANCE_PRECISION) / DISTANCE_PRECISION
}

export function scoreQuestion(question: ScorableQuestion, guesses: ScorableGuess[]): Map<string, GuessScore> {
  const scores = new Map<string, GuessScore>()
  if (!question.resolved_at || question.correct_answer === null) return scores

  const questionGuesses = guesses.filter((g) => g.question_id === question.id)

  if (isClosestWinsType(question.type)) {
    const target = toComparable(question.type, question.correct_answer)
    const ranked: { id: string; distance: number }[] = []

    for (const guess of questionGuesses) {
      const value = toComparable(question.type, guess.answer)
      if (target === null || value === null) {
        scores.set(guess.id, { points: 0, isCorrect: false })
      } else {
        ranked.push({ id: guess.id, distance: distanceBetween(question.type, value, target) })
      }
    }

    ranked.sort((a, b) => a.distance - b.distance)
    let rank = 0
    ranked.forEach((entry, index) => {
      if (index === 0 || entry.distance !== ranked[index - 1].distance) rank = index + 1
      scores.set(entry.id, {
        points: PODIUM_POINTS[rank - 1] ?? 0,
        isCorrect: entry.distance === 0,
        rank,
      })
    })
    return scores
  }

  const correct = textOf(question.correct_answer)
  for (const guess of questionGuesses) {
    let isCorrect: boolean
    if (question.type === 'option') {
      isCorrect = textOf(guess.answer) === correct
    } else {
      // Free text (and any unknown type): admin override wins over the
      // normalized match.
      isCorrect = guess.is_correct ?? normalizeText(textOf(guess.answer)) === normalizeText(correct)
    }
    scores.set(guess.id, { points: isCorrect ? POINTS_EXACT : 0, isCorrect })
  }
  return scores
}

export function buildStandings(
  questions: ScorableQuestion[],
  guesses: ScorableGuess[],
  members: { id: string; name: string }[],
  unknownName: string,
): Standing[] {
  const nameById = new Map(members.map((m) => [m.id, m.name]))
  const byUser = new Map<string, Omit<Standing, 'rank'>>()

  for (const question of questions) {
    if (!question.resolved_at) continue
    const questionGuesses = guesses.filter((g) => g.question_id === question.id)
    const scores = scoreQuestion(question, questionGuesses)

    for (const guess of questionGuesses) {
      const score = scores.get(guess.id)
      const entry = byUser.get(guess.user_id) ?? {
        userId: guess.user_id,
        name: nameById.get(guess.user_id) ?? unknownName,
        points: 0,
        correctCount: 0,
        podiumCount: 0,
        funnyCount: 0,
      }
      entry.points += score?.points ?? 0
      if (score?.isCorrect) entry.correctCount += 1
      if (score?.rank !== undefined && score.rank <= PODIUM_POINTS.length) entry.podiumCount += 1
      if (guess.is_funny) entry.funnyCount += 1
      byUser.set(guess.user_id, entry)
    }
  }

  // Ties share a rank with no tie-break (owner decision); name order only
  // keeps the list stable between loads.
  const sorted = [...byUser.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  let rank = 0
  return sorted.map((entry, index) => {
    if (index === 0 || entry.points !== sorted[index - 1].points) rank = index + 1
    return { ...entry, rank }
  })
}
