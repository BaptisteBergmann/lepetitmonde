import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { Enums } from '@utils/supabase/database.types'
import { canAccessPage, type PageOverride } from '@utils/member-access'
import { PAGE_REGISTRY } from '@utils/page_registry'
import { run, type ToolContext } from './shared'

// Pages that have MCP tools (now or planned): `areas` tells the model which
// tool families it may call for a given baby.
const MCP_AREAS = ['todo', 'tracker', 'health', 'buy-list', 'calendar', 'inventory', 'anecdotes'] as const

export function registerBabyTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'list_babies',
    {
      title: 'List babies',
      description: 'Lists every baby you are a member of, with your accessLevel (admin or viewer) and the areas (todo, tracker, health, buy-list, calendar, inventory, anecdotes) you can use for it. Call this first to get a babyId.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () => run('list_babies', ctx, async () => {
      const { data, error } = await admin
        .from('baby_access')
        .select('access_level, babies (id, baby_surname)')
        .eq('user_id', userId)
      if (error) throw error

      // Typed without Database, so the embedded relation is inferred as an array.
      type Baby = { id: string; baby_surname: string }
      const memberships = (data ?? []).flatMap((row) => {
        const babies = row.babies as unknown as Baby | Baby[] | null
        return [babies ?? []].flat().map((baby) => ({ baby, level: row.access_level as Enums<'role'> }))
      })
      if (memberships.length === 0) return []

      const { data: settings, error: settingsError } = await admin
        .from('page_settings')
        .select('baby_id, page_id, enabled, required_role')
        .in('baby_id', memberships.map((m) => m.baby.id))
        .in('page_id', [...MCP_AREAS])
      if (settingsError) throw settingsError

      const overrides = new Map((settings ?? []).map((row) => [`${row.baby_id}:${row.page_id}`, row as PageOverride]))
      const entries = PAGE_REGISTRY.filter((page) => (MCP_AREAS as readonly string[]).includes(page.id))

      return memberships.map(({ baby, level }) => ({
        id: baby.id,
        name: baby.baby_surname,
        accessLevel: level,
        areas: entries
          // The todo tools are admin-only whatever the page role says.
          .filter((entry) => (entry.id !== 'todo' || level === 'admin') && canAccessPage(entry, overrides.get(`${baby.id}:${entry.id}`), level))
          .map((entry) => entry.id),
      }))
    }),
  )
}
