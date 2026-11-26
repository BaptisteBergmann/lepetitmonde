import type { ChecklistRowData } from './checklist_row'

// Pure on purpose (no React, no refs): the checklist passes in plain sets and applies
// the result. It reconciles the rows on screen with a fresh server snapshot without
// touching anything the user is working on.

export type MergeContext = {
  // Ids the server has, or has a create queued for. Anything else is local-only.
  known: ReadonlySet<string>
  // Ids with a debounce timer, an op in flight, or a write that settled recently. The
  // grace window covers a snapshot that was read before our write and lands after it.
  // May include ids that are not on screen (a row we just deleted must not come back).
  lockedIds: ReadonlySet<string>
  // The row whose textarea has focus, if any.
  focusedId: string | null
  // Focus is anywhere inside the list: keep the local order so no focused node moves.
  focusInside: boolean
}

export type MergeResult = {
  rows: ChecklistRowData[]
  changed: boolean
  // Protected rows whose server state differs from ours: retry once they unlock.
  deferred: ReadonlySet<string>
  // Rows now in sync with the server: record their title as saved/queued and known.
  adopted: ReadonlyMap<string, string>
  // Rows removed because the server deleted them.
  dropped: string[]
  // Focused rows the server deleted: kept on screen until blur.
  remoteDeleted: string[]
  // Rows another device checked / unchecked (to animate).
  remoteChecked: string[]
  remoteUnchecked: string[]
}

const isBlank = (row: ChecklistRowData) => !row.title.trim()

const differs = (a: ChecklistRowData, b: ChecklistRowData) =>
  a.title !== b.title || a.done !== b.done || a.doneAt !== b.doneAt

export function mergeRows(local: ChecklistRowData[], server: ChecklistRowData[], ctx: MergeContext): MergeResult {
  const isProtected = (id: string) => id === ctx.focusedId || ctx.lockedIds.has(id)
  const serverById = new Map(server.map((row) => [row.id, row]))
  const localIds = new Set(local.map((row) => row.id))

  const resolved = new Map<string, ChecklistRowData>()
  // Local rows the server doesn't have, kept anyway.
  const extras = new Set<string>()
  const deferred = new Set<string>()
  const adopted = new Map<string, string>()
  const dropped: string[] = []
  const remoteDeleted: string[] = []
  const remoteChecked: string[] = []
  const remoteUnchecked: string[] = []

  for (const row of local) {
    const theirs = serverById.get(row.id)
    if (theirs) {
      if (isProtected(row.id)) {
        resolved.set(row.id, row)
        if (differs(row, theirs)) deferred.add(row.id)
      } else {
        resolved.set(row.id, theirs)
        adopted.set(row.id, theirs.title)
        if (theirs.done && !row.done) remoteChecked.push(row.id)
        if (!theirs.done && row.done) remoteUnchecked.push(row.id)
      }
      continue
    }

    if (!ctx.known.has(row.id)) {
      // Draft row, or a typed row whose create hasn't been queued yet.
      resolved.set(row.id, row)
      extras.add(row.id)
    } else if (ctx.lockedIds.has(row.id)) {
      // Our create or edit is on its way, or the snapshot may predate it.
      resolved.set(row.id, row)
      extras.add(row.id)
      deferred.add(row.id)
    } else if (row.id === ctx.focusedId) {
      // Deleted elsewhere while being typed in: keep it so focus isn't stolen.
      resolved.set(row.id, row)
      extras.add(row.id)
      remoteDeleted.push(row.id)
    } else {
      dropped.push(row.id)
    }
  }

  for (const row of server) {
    if (localIds.has(row.id)) continue
    if (ctx.lockedIds.has(row.id)) {
      // We deleted it a moment ago and the snapshot still has it.
      deferred.add(row.id)
      continue
    }
    resolved.set(row.id, row)
    adopted.set(row.id, row.title)
  }

  let ordered: ChecklistRowData[]
  if (!ctx.focusInside) {
    ordered = server.filter((row) => resolved.has(row.id)).map((row) => resolved.get(row.id)!)
    // Local-only rows go after their nearest preceding local neighbour; blank ones
    // (the draft) stay last so there is always somewhere to type.
    local.forEach((row, index) => {
      if (!extras.has(row.id)) return
      const mine = resolved.get(row.id)!
      if (isBlank(mine)) {
        ordered.push(mine)
        return
      }
      let at = 0
      for (let j = index - 1; j >= 0; j--) {
        const position = ordered.findIndex((candidate) => candidate.id === local[j].id)
        if (position !== -1) { at = position + 1; break }
      }
      ordered.splice(at, 0, mine)
    })
  } else {
    ordered = local.filter((row) => resolved.has(row.id)).map((row) => resolved.get(row.id)!)
    server.forEach((row, index) => {
      if (localIds.has(row.id) || !resolved.has(row.id)) return
      let at = 0
      for (let j = index - 1; j >= 0; j--) {
        const position = ordered.findIndex((candidate) => candidate.id === server[j].id)
        if (position !== -1) { at = position + 1; break }
      }
      ordered.splice(at, 0, resolved.get(row.id)!)
    })
  }

  const changed =
    ordered.length !== local.length || ordered.some((row, index) => row.id !== local[index].id || differs(row, local[index]))

  return { rows: changed ? ordered : local, changed, deferred, adopted, dropped, remoteDeleted, remoteChecked, remoteUnchecked }
}
