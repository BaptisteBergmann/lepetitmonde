// Pure helpers for the circle tree (circles.parent_circle). No 'server-only':
// client components (pickers, admin tree) import it too, so the rule is computed
// from one place on both sides. Every walk is guarded by a visited set so a
// corrupt cycle in the data can never loop forever.

export const CIRCLE_MAX_DEPTH = 3

export type CircleNode = { id: string; parent_circle: string | null }

function parentMap(nodes: CircleNode[]) {
  return new Map(nodes.map((node) => [node.id, node.parent_circle]))
}

function childrenMap(nodes: CircleNode[]) {
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (!node.parent_circle) continue
    const list = children.get(node.parent_circle)
    if (list) list.push(node.id)
    else children.set(node.parent_circle, [node.id])
  }
  return children
}

// Each id plus its parent, grandparent, and so on.
export function ancestorsOrSelf(ids: Iterable<string>, nodes: CircleNode[]): Set<string> {
  const parents = parentMap(nodes)
  const result = new Set<string>()
  for (const id of ids) {
    let current: string | null | undefined = id
    while (current && !result.has(current)) {
      result.add(current)
      current = parents.get(current)
    }
  }
  return result
}

// Each id plus every circle below it.
export function descendantsOrSelf(ids: Iterable<string>, nodes: CircleNode[]): Set<string> {
  const children = childrenMap(nodes)
  const result = new Set<string>()
  const stack = Array.from(ids)
  while (stack.length > 0) {
    const id = stack.pop()!
    if (result.has(id)) continue
    result.add(id)
    stack.push(...(children.get(id) ?? []))
  }
  return result
}

// 1 for a root circle.
export function depthOf(id: string, nodes: CircleNode[]): number {
  return ancestorsOrSelf([id], nodes).size
}

// 1 for a leaf, counting the circle itself.
export function subtreeHeight(id: string, nodes: CircleNode[]): number {
  const children = childrenMap(nodes)
  const visited = new Set<string>()
  function walk(current: string): number {
    if (visited.has(current)) return 0
    visited.add(current)
    let max = 0
    for (const child of children.get(current) ?? []) max = Math.max(max, walk(child))
    return max + 1
  }
  return walk(id)
}

// Circles that can hold `circleId` (or a brand-new circle when null): not itself,
// not one of its descendants, and deep enough to keep the whole subtree within the limit.
export function validParentIds(circleId: string | null, nodes: CircleNode[]): string[] {
  const excluded = circleId ? descendantsOrSelf([circleId], nodes) : new Set<string>()
  const height = circleId ? subtreeHeight(circleId, nodes) : 1
  return nodes
    .filter((node) => !excluded.has(node.id) && depthOf(node.id, nodes) + height <= CIRCLE_MAX_DEPTH)
    .map((node) => node.id)
}

// Depth-first order (roots first, siblings by name when available) with the depth
// (0 for roots) so lists can indent. Circles whose parent is missing are treated as roots.
export function orderAsTree<T extends CircleNode & { name?: string | null }>(circles: T[]): (T & { depth: number })[] {
  const ids = new Set(circles.map((circle) => circle.id))
  const byName = (a: T, b: T) => (a.name ?? '').localeCompare(b.name ?? '')
  const children = new Map<string, T[]>()
  const roots: T[] = []
  for (const circle of circles) {
    if (circle.parent_circle && ids.has(circle.parent_circle)) {
      const list = children.get(circle.parent_circle)
      if (list) list.push(circle)
      else children.set(circle.parent_circle, [circle])
    } else {
      roots.push(circle)
    }
  }

  const result: (T & { depth: number })[] = []
  const visited = new Set<string>()
  function walk(circle: T, depth: number) {
    if (visited.has(circle.id)) return
    visited.add(circle.id)
    result.push({ ...circle, depth })
    for (const child of (children.get(circle.id) ?? []).sort(byName)) walk(child, depth + 1)
  }
  for (const root of roots.sort(byName)) walk(root, 0)
  return result
}

// The root of each circle's tree, for "one circle per tree".
export function rootOf(id: string, nodes: CircleNode[]): string {
  const parents = parentMap(nodes)
  const seen = new Set<string>()
  let current = id
  while (!seen.has(current)) {
    seen.add(current)
    const parent = parents.get(current)
    if (!parent) break
    current = parent
  }
  return current
}
