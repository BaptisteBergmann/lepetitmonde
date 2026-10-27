import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { run, type ToolContext } from './shared'

export function registerBabyTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'list_babies',
    {
      title: 'List babies',
      description: 'Lists the babies whose to-do list you administer. Call this first to get a babyId.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () => run('list_babies', ctx, async () => {
      const { data, error } = await admin
        .from('baby_access')
        .select('babies (id, baby_surname)')
        .eq('user_id', userId)
        .eq('access_level', 'admin')
      if (error) throw error
      // Typed without Database, so the embedded relation is inferred as an array.
      type Baby = { id: string; baby_surname: string }
      return (data ?? []).flatMap((row) => {
        const babies = row.babies as unknown as Baby | Baby[] | null
        return [babies ?? []].flat().map((baby) => ({ id: baby.id, name: baby.baby_surname }))
      })
    }),
  )
}
