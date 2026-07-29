'use client'

// Tracks the client-side pathname history for this app session so that
// navigating "home" can reuse the real root history entry (via history.go)
// instead of pushing a new one. Pushing a new '/' entry on top of an
// existing one is what breaks the Android back button: the stack becomes
// ['/', '/journal', '/'] and back pops to '/journal' instead of exiting.

let pathStack: string[] = []
let cursor = -1
let cameFromPopstate = false
let initialized = false

function currentUrl() {
  return window.location.pathname + window.location.search
}

function ensureInit() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  pathStack = [currentUrl()]
  cursor = 0
  window.addEventListener('popstate', () => {
    cameFromPopstate = true
  })
}

// `url` is the full pathname + search string (e.g. '/baby/1/calendar?month=2026-07') —
// query-only navigations (see calendar_view.tsx's month picker) still call
// history.pushState, so they must be tracked too or the cursor math below drifts.
export function trackPathnameChange(url: string) {
  ensureInit()
  if (typeof window === 'undefined') return

  if (cameFromPopstate) {
    cameFromPopstate = false
    for (let i = cursor - 1; i >= 0; i--) {
      if (pathStack[i] === url) {
        cursor = i
        return
      }
    }
    for (let i = cursor + 1; i < pathStack.length; i++) {
      if (pathStack[i] === url) {
        cursor = i
        return
      }
    }
    // Landed somewhere we didn't track (e.g. deep link) — resync.
    pathStack = [url]
    cursor = 0
    return
  }

  if (pathStack[cursor] === url) return
  pathStack = pathStack.slice(0, cursor + 1)
  pathStack.push(url)
  cursor = pathStack.length - 1
}

export function isStandalonePwa() {
  return typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
}

// Navigates to '/' by going back to the nearest real root entry already in
// this session's history, so the Android back button can exit the app
// afterwards instead of replaying pages you already left. Falls back to a
// normal push when root isn't in the tracked history (e.g. fresh deep link).
//
// Only applies in standalone (installed) mode: in a regular browser tab,
// "back replays the page you were on before this click" is the expected,
// familiar behavior and shouldn't be overridden.
export function goToRoot(currentPathname: string, push: (href: string) => void) {
  ensureInit()
  if (currentPathname === '/') return

  if (isStandalonePwa()) {
    for (let i = cursor - 1; i >= 0; i--) {
      if (pathStack[i] === '/') {
        window.history.go(i - cursor)
        return
      }
    }
  }
  push('/')
}
