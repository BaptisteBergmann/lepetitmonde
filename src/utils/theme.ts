export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'theme'
export const THEME_CHANGE_EVENT = 'themechange'

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function subscribeThemePreference(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

// The class toggling itself lives in the inline script in app/layout.tsx (it must run before
// hydration to avoid a flash); it re-applies whenever THEME_CHANGE_EVENT fires.
export function writeThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Storage blocked (private mode): the choice just won't persist.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}
