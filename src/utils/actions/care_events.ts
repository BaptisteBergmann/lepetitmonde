'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import type { Enums } from '@utils/supabase/database.types'
import { actionError } from './errors'
import { getRequestTimeZone } from '../care-timezone'
import {
  createCareEventCore,
  deleteCareEventCore,
  getTrackerDayCore,
  getTrackerNowCore,
  startCareTimerCore,
  stopCareTimerCore,
  updateCareEventCore,
  type CareEvent,
  type TrackerNow,
} from '../care-core'
import { CareValidationError, type CareEventInput, type CareResult } from '../care-validation'

// Thin session wrappers: the logic and the tracker access check live in
// care-core.ts so the MCP endpoint applies the same rules. Types are
// re-exported from there (type-only, allowed in a server action file).
export type { CareEvent, TrackerNow }

async function requireUserId() {
  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthenticated')
  return user.id
}

// Expected failures come back as `{ ok: false, error }` because thrown Server Action
// messages are masked in production; the client translates the key. Auth failures and
// unexpected errors still throw.
async function toResult(fn: () => Promise<void>): Promise<CareResult> {
  try {
    await fn()
    return { ok: true }
  } catch (err) {
    if (err instanceof CareValidationError) return { ok: false, error: err.key }
    throw err
  }
}

export async function getTrackerDay(babyId: string, day: string): Promise<CareEvent[]> {
  const userId = await requireUserId()
  return getTrackerDayCore(await createClient(), userId, babyId, day, await getRequestTimeZone())
}

export async function getTrackerNow(babyId: string): Promise<TrackerNow> {
  const userId = await requireUserId()
  return getTrackerNowCore(await createClient(), userId, babyId)
}

export async function startCareTimer(
  babyId: string,
  kind: Enums<'care_event_kind'>,
  opts: { side?: Enums<'breast_side'>; startedAt?: string } = {},
): Promise<CareResult> {
  const userId = await requireUserId()
  return toResult(async () => startCareTimerCore(await createClient(), userId, babyId, kind, opts))
}

export async function stopCareTimer(babyId: string, eventId: string, opts: { side?: Enums<'breast_side'> } = {}): Promise<CareResult> {
  const userId = await requireUserId()
  return toResult(async () => stopCareTimerCore(await createClient(), userId, babyId, eventId, opts))
}

export async function createCareEvent(babyId: string, input: CareEventInput): Promise<CareResult> {
  const userId = await requireUserId()
  return toResult(async () => createCareEventCore(await createClient(), userId, babyId, input))
}

export async function updateCareEvent(babyId: string, eventId: string, input: CareEventInput): Promise<CareResult> {
  const userId = await requireUserId()
  return toResult(async () => updateCareEventCore(await createClient(), userId, babyId, eventId, input))
}

export async function deleteCareEvent(babyId: string, eventId: string): Promise<CareResult> {
  const userId = await requireUserId()
  return toResult(async () => deleteCareEventCore(await createClient(), userId, babyId, eventId))
}
