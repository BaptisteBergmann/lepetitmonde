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
