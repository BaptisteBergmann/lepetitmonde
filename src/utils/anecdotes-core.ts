// Deliberately NOT a 'use server' module: every function takes a userId and
// trusts it, so exporting them from an action file would make each one a
// publicly callable endpoint. They re-check access themselves, so no caller
// (server action with the cookie client, MCP tool with the service-role
// client) can skip it. Only import from server code that has already
// authenticated the user.
import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import type { Tables } from '@utils/supabase/database.types'
import type { Locale } from '@/i18n/config'
import { logger } from './logger'
import { assertIsAdminForUser } from './actions/access'
import { actionError } from './actions/errors'
import { notifyUsers } from './actions/notify'
import { ensureBabyBucket } from './actions/storage'
import { normalizeText } from './feed-validation'
import { INPUT_LIMITS } from './input-limits'
import {
  assertCirclesInBabyWith,
  assertPageAccessForUser,
  getMemberAccess,
  getViewerCircleIds,
  getVisibleUserIdsWith,
} from './member-access'

// The web actions never checked page_settings (only the page does), so their
// wrappers pass enforcePage: false to keep their exact rules. MCP callers
// always enforce it: a disabled anecdotes page blocks its tools.
type AccessOptions = { enforcePage?: boolean }

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AnecdoteRow = Tables<'anecdotes'> & { circleIds: string[] }

async function assertBabyId(babyId: unknown) {
  if (typeof babyId !== 'string' || !ID_RE.test(babyId)) throw await actionError('unauthorized')
}

// Anecdotes the user may see, newest first. An anecdote with no circle is
// hidden by default: only admins see it until it is shared with at least one
// circle. Throws on database errors; the web wrapper turns that into an empty
// list. A non-member gets [] when the page isn't enforced (as RLS did).
export async function listAnecdotesCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  page: AnecdotePage,
  options: AccessOptions = {},
): Promise<AnecdoteRow[]> {
  return (await listAnecdotesPageCore(supabase, userId, babyId, page, options)).items
}

export type AnecdoteCursor = { happenedAt: string; createdAt: string }
type AnecdotePage = { limit: number; before?: AnecdoteCursor }

// The cursor goes into a PostgREST filter string, so only timestamp characters.
const CURSOR_RE = /^[0-9T:.+\-Z ]{1,40}$/

// Same as listAnecdotesCore, plus a cursor built from the last raw
// (pre-circle-filter) row: the filter runs after the limit, so a viewer's page
// can be short while more rows exist. null only when the raw page was short.
export async function listAnecdotesPageCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  { limit, before }: AnecdotePage,
  { enforcePage = true }: AccessOptions = {},
): Promise<{ items: AnecdoteRow[]; nextCursor: AnecdoteCursor | null }> {
  await assertBabyId(babyId)
  if (before && (!CURSOR_RE.test(before.happenedAt) || !CURSOR_RE.test(before.createdAt))) throw await actionError('invalidInput')

  let level
  if (enforcePage) level = await assertPageAccessForUser(supabase, userId, babyId, 'anecdotes')
  else level = await getMemberAccess(supabase, userId, babyId)
  if (!level) return { items: [], nextCursor: null }

  const contextLogger = logger.child({ function: listAnecdotesPageCore.name, babyId, limit, before })

  const isAdmin = level === 'admin'
  const userCircleIds = new Set(isAdmin ? [] : await getViewerCircleIds(supabase, userId, babyId))

  let query = supabase
    .from('anecdotes')
    .select('*, anecdotes_circles (circle_id)')
    .eq('baby_id', babyId)
    .order('happened_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.or(
      `happened_at.lt.${before.happenedAt},and(happened_at.eq.${before.happenedAt},created_at.lt.${before.createdAt})`
    )
  }

  const { data, error } = await query

  if (error) { contextLogger.error(error, "Error fetching anecdotes"); throw error }

  const last = data.length >= limit ? data[data.length - 1] : null
  const nextCursor = last ? { happenedAt: last.happened_at as string, createdAt: last.created_at as string } : null

  const visible = data
    .map(({ anecdotes_circles, ...anecdote }) => ({
      ...(anecdote as Tables<'anecdotes'>),
      circleIds: (anecdotes_circles as { circle_id: string }[]).map((ac) => ac.circle_id),
    }))
    .filter((row) => isAdmin || row.circleIds.some((id) => userCircleIds.has(id)))

  contextLogger.debug({ count: visible.length }, "Anecdotes received")

  return { items: visible, nextCursor }
}

// Admin only. Sets created_by explicitly (no session on the MCP path, and the
// auth.uid() column default is nullable, so it would silently store null).
// Every create notifies the people who can see it, never its creator. `id` is
// client-supplied on the web (the photo path needs it before the insert) and
// generated here otherwise. `locale` is for callers without a request locale
// (Route Handlers). Returns the anecdote id.
export async function createAnecdoteCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  anecdote: { id?: string; content: string; happenedAt: string },
  circleIds: string[],
  { enforcePage = true, locale }: AccessOptions & { locale?: Locale } = {},
): Promise<string> {
  await assertBabyId(babyId)
  await assertIsAdminForUser(supabase, userId, babyId)
  if (enforcePage) await assertPageAccessForUser(supabase, userId, babyId, 'anecdotes')

  const contextLogger = logger.child({ function: createAnecdoteCore.name, babyId })

  // Shape first: new Set("abc") would split a string into characters.
  if (!Array.isArray(circleIds) || !circleIds.every((id) => typeof id === 'string')) {
    contextLogger.warn("Rejected malformed circleIds")
    throw await actionError('unauthorized')
  }
  await assertCirclesInBabyWith(supabase, circleIds, babyId)

  if (anecdote.id !== undefined && (typeof anecdote.id !== 'string' || !ID_RE.test(anecdote.id))) throw await actionError('invalidInput')
  if (typeof anecdote.happenedAt !== 'string' || Number.isNaN(Date.parse(anecdote.happenedAt))) throw await actionError('invalidInput')
  const content = await normalizeText(anecdote.content, INPUT_LIMITS.anecdoteContent, { requiredKey: 'textRequired' })

  // Uses its own service-role client, whatever client we were given.
  await ensureBabyBucket(babyId)

  const { data, error } = await supabase
    .from('anecdotes')
    .insert([{
      id: anecdote.id ?? randomUUID(),
      baby_id: babyId,
      created_by: userId,
      content,
      happened_at: anecdote.happenedAt,
    }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating anecdote"); throw error }

  const uniqueCircleIds = Array.from(new Set(circleIds))
  if (uniqueCircleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('anecdotes_circles')
      .insert(uniqueCircleIds.map((circleId) => ({ anecdote_id: data.id, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking anecdote circles"); throw circlesError }
  }

  contextLogger.info({ anecdoteId: data.id }, "Anecdote created")

  const recipients = await getVisibleUserIdsWith(supabase, babyId, uniqueCircleIds, userId)
  const t = locale
    ? await getTranslations({ locale, namespace: 'pushNotifications' })
    : await getTranslations('pushNotifications')
  await notifyUsers(babyId, 'new_anecdote', {
    title: t('newAnecdote.title'),
    body: content.slice(0, 120),
    url: `/baby/${babyId}/anecdotes`,
  }, recipients)

  revalidatePath(`/baby/${babyId}/anecdotes`)

  return data.id as string
}
