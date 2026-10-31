import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { createAdminClient } from '@utils/supabase/admin'
import { registerBabyTools } from './babies'
import { registerAnecdoteTools } from './anecdotes'
import { registerBuyListTools } from './buy_list'
import { registerCalendarTools } from './calendar'
import { registerDigestTools } from './digest'
import { registerHealthTools } from './health'
import { registerInventoryTools } from './inventory'
import { registerTodoTools } from './todo'
import { registerTrackerTools } from './tracker'

// Service role: there is no session on this endpoint, so every tool's core
// checks access for ctx.userId (a verified API token) and scopes by baby_id.
export function registerTools(server: McpServer, ctx: { userId: string; tokenId: string }) {
  const toolCtx = { ...ctx, admin: createAdminClient() }
  registerBabyTools(server, toolCtx)
  registerTodoTools(server, toolCtx)
  registerTrackerTools(server, toolCtx)
  registerHealthTools(server, toolCtx)
  registerBuyListTools(server, toolCtx)
  registerCalendarTools(server, toolCtx)
  registerInventoryTools(server, toolCtx)
  registerAnecdoteTools(server, toolCtx)
  registerDigestTools(server, toolCtx)
}
