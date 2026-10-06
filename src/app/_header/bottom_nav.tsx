"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { AccessWithPages } from './types'
import { PAGE_REGISTRY } from '@utils/page_registry'
import { getOrderedPages } from './page_order'

// Icons resolved from PAGE_REGISTRY rather than through the `accesses` prop —
// see the note on NavPage in ./types for why icons can't cross the Server →
// Client boundary.
const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'file', 'submit', 'range', 'color', 'date'])

// The visual viewport has to shrink at least this much to count as "keyboard
// up" — enough to ignore browser toolbars collapsing/expanding.
const KEYBOARD_MIN_HEIGHT_PX = 150

// True when the focused element brings up the on-screen keyboard.
function isTextEntry(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLElement && el.isContentEditable) return true
  return el instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(el.type)
}

const ICONS_BY_PAGE_ID = new Map<string, typeof PAGE_REGISTRY[number]['icon']>(
  PAGE_REGISTRY.map((page) => [page.id, page.icon])
)

export default function BottomNav({ accesses }: { accesses: AccessWithPages[] }) {
  const params = useParams()
  const pathname = usePathname()
  const currentBabyId = params?.babyId as string
  // While the mobile keyboard is up the fixed bar would cover the focused
  // field (e.g. the comment input), so it steps aside app-wide.
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    let frame = 0
    const viewport = window.visualViewport
    // Focus alone isn't enough: Android's Back button closes the keyboard but
    // leaves the field focused. When visualViewport exists, also require it
    // to be clearly shorter than the window (the keyboard is actually up);
    // without it, fall back to focus only.
    const check = () => {
      const focused = isTextEntry(document.activeElement)
      const shrunk = !viewport || window.innerHeight - viewport.height > KEYBOARD_MIN_HEIGHT_PX
      setKeyboardOpen(focused && shrunk)
    }
    // Re-check on the next frame: when focus moves between two fields,
    // activeElement is still <body> during focusout and the bar would flicker.
    const handleFocusOut = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(check)
    }
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', handleFocusOut)
    // The keyboard opens/closes after focus changes, so follow the viewport too.
    viewport?.addEventListener('resize', check)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('focusin', check)
      document.removeEventListener('focusout', handleFocusOut)
      viewport?.removeEventListener('resize', check)
    }
  }, [])

  const babyAccess = accesses.find((acc) => acc.baby_id === currentBabyId)
  const allowedPages = babyAccess?.allowedPages ?? []

  if (!allowedPages.length || keyboardOpen) return null

  // Hub page ("choose a page to view") already lists every section as a
  // card — showing the same links again in the bottom bar is redundant.
  const isHubPage = pathname === `/baby/${currentBabyId}`
  if (isHubPage) return null

  const orderedPages = getOrderedPages(allowedPages)

  return (
    <nav
      className="fixed bottom-0 left-0 z-40 flex w-full items-stretch justify-around gap-0.5 overflow-x-auto border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
    >
      {orderedPages.map((page) => {
        const Icon = ICONS_BY_PAGE_ID.get(page.id) ?? Menu
        const href = `/baby/${currentBabyId}/${page.id}`
        // startsWith (not exact match): several pages have nested routes
        // (e.g. albums/[albumId]) that should still highlight the tab.
        const isActive = pathname === href || (pathname?.startsWith(`${href}/`) ?? false)

        return (
          <Link
            key={page.id}
            href={href}
            aria-label={page.name}
            className={`relative flex min-w-14 flex-1 items-center justify-center py-3 transition-colors touch-target ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            <Icon className="h-6 w-6 shrink-0" />
          </Link>
        )
      })}
    </nav>
  )
}
