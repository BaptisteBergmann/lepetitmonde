// Server-side number/enum checks for Server Action input. Not a 'use server'
// module (these must not become callable endpoints). Text goes through
// normalizeText in feed-validation.ts.
import 'server-only'
import { actionError } from '@utils/actions/errors'

type NumberOptions = { min: number; max: number; nullable?: boolean }
type NullableNumberOptions = NumberOptions & { nullable: true }

export async function normalizeNumber(value: unknown, options: NullableNumberOptions): Promise<number | null>
export async function normalizeNumber(value: unknown, options: NumberOptions & { nullable?: false }): Promise<number>
export async function normalizeNumber(value: unknown, options: NumberOptions): Promise<number | null> {
  if (value === null || value === undefined) {
    if (options.nullable) return null
    throw await actionError('invalidInput')
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < options.min || value > options.max) {
    throw await actionError('invalidInput')
  }
  return value
}

export async function normalizeInteger(value: unknown, options: NullableNumberOptions): Promise<number | null>
export async function normalizeInteger(value: unknown, options: NumberOptions & { nullable?: false }): Promise<number>
export async function normalizeInteger(value: unknown, options: NumberOptions): Promise<number | null> {
  const n = await normalizeNumber(value, options as NullableNumberOptions)
  if (n !== null && !Number.isInteger(n)) throw await actionError('invalidInput')
  return n
}

export async function assertOneOf<T extends string>(value: unknown, allowed: readonly T[], options: { nullable: true }): Promise<T | null>
export async function assertOneOf<T extends string>(value: unknown, allowed: readonly T[], options?: { nullable?: false }): Promise<T>
export async function assertOneOf<T extends string>(value: unknown, allowed: readonly T[], options: { nullable?: boolean } = {}): Promise<T | null> {
  if (value === null || value === undefined) {
    if (options.nullable) return null
    throw await actionError('invalidInput')
  }
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw await actionError('invalidInput')
  }
  return value as T
}
