import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ActionError } from '@utils/actions/errors'
import { isValidDay, isValidTimeZone, parseZonedDateTime } from '@utils/care-time'
import { logger } from '@utils/logger'

// Tool descriptions are for the model, so they stay in English and out of next-intl.

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

// `admin` is the service-role client: every core checks access for `userId`
// itself and scopes its queries by baby_id.
export type ToolContext = { userId: string; tokenId: string; admin: SupabaseClient }

export function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }
}

// Core errors come back as tool errors, not HTTP 500s. Only ActionError text
// (translated, written for users) is shown; raw database errors stay in the logs.
export async function run(tool: string, ctx: { userId: string; tokenId: string; babyId?: string }, fn: () => Promise<unknown>): Promise<ToolResult> {
  const contextLogger = logger.child({ function: 'mcpTool', route: '/api/mcp', tool, tokenId: ctx.tokenId, userId: ctx.userId, babyId: ctx.babyId })
  try {
    const result = await fn()
    contextLogger.info('MCP tool call')
    return ok(result ?? 'Done')
  } catch (err) {
    contextLogger.warn({ err }, 'MCP tool call failed')
    const message = err instanceof ActionError ? err.message : 'The request failed.'
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

export const babyId = z.uuid().describe('Baby id, from list_babies')

// Invalid zones are rejected rather than replaced (unlike the tz cookie).
export const timeZone = z
  .string()
  .max(64)
  .refine(isValidTimeZone, 'Must be an IANA time zone such as Europe/Paris')
  .optional()
  .describe('IANA time zone, defaults to Europe/Paris')

// ISO 8601 with Z/offset is used as is; a local time is read in `timeZone`.
export const zonedDateTime = z
  .string()
  .max(40)
  .refine((value) => {
    try {
      parseZonedDateTime(value, 'UTC')
      return true
    } catch {
      return false
    }
  }, 'Must be ISO 8601 with Z/offset, or local YYYY-MM-DDTHH:mm[:ss]')
  .describe('ISO 8601 with Z or offset, or local YYYY-MM-DDTHH:mm[:ss] in timeZone')

export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidDay, 'Must be a valid YYYY-MM-DD date')
  .describe('Day as YYYY-MM-DD')
