import { PageId } from '@utils/page_registry'

// The pages people open most (pronostics, journal, albums) get the center
// spots in the bottom bar; whatever else is enabled flanks them symmetrically
// instead of following PAGE_REGISTRY order.
const PRIMARY_PAGE_IDS: PageId[] = ['guess', 'feed', 'albums']

export function getOrderedPages<T extends { id: string }>(pages: T[]): T[] {
  const primary = PRIMARY_PAGE_IDS
    .map((id) => pages.find((page) => page.id === id))
    .filter((page): page is T => !!page)
  const secondary = pages.filter((page) => !(PRIMARY_PAGE_IDS as string[]).includes(page.id))

  const splitIndex = Math.ceil(secondary.length / 2)
  return [...secondary.slice(0, splitIndex), ...primary, ...secondary.slice(splitIndex)]
}

// Visible tab slots in the mobile bar; the "More" menu takes one extra slot.
export const MAX_VISIBLE = 4

// Splits pages into the bar's visible tabs and the "More" menu. Priority for a
// visible slot: primary pages, then the rest in registry order, admin last.
// With MAX_VISIBLE + 1 pages or fewer everything stays inline, since "More"
// would otherwise hide a single item.
export function splitNavPages<T extends { id: string }>(
  pages: T[],
  maxVisible: number = MAX_VISIBLE
): { visible: T[]; overflow: T[] } {
  if (pages.length <= maxVisible + 1) {
    return { visible: getOrderedPages(pages), overflow: [] }
  }

  const primary = PRIMARY_PAGE_IDS
    .map((id) => pages.find((page) => page.id === id))
    .filter((page): page is T => !!page)
  const rest = pages.filter((page) => !(PRIMARY_PAGE_IDS as string[]).includes(page.id))
  const priority = [
    ...primary,
    ...rest.filter((page) => page.id !== 'admin'),
    ...rest.filter((page) => page.id === 'admin'),
  ]

  const visibleSet = new Set(priority.slice(0, maxVisible))
  return {
    visible: getOrderedPages(pages.filter((page) => visibleSet.has(page))),
    overflow: pages.filter((page) => !visibleSet.has(page)),
  }
}
