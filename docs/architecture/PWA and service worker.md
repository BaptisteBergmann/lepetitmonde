---
tags: [lepetitmonde/architecture]
---

# PWA and service worker

Up: [[Le petit monde]] · See also [[Notifications pipeline]], [[Onboarding]]

- **Installable** on iOS and Android home screens: `src/app/manifest.ts` (icons and screenshots in `public/`).
- **Service worker**: source in `src/worker/index.ts`, mirrored byte-for-byte to `public/sw.js` (no build step). It only displays push notifications and opens the right page on click. There is no offline cache.
- `proxy.ts` lets `manifest.webmanifest` and `sw.js` through without a session, otherwise the browser would receive an HTML login redirect.
- `src/components/install-card.tsx` gives platform-specific instructions: the native prompt on Chrome/Android, the Share-sheet steps on iOS (where push needs a home-screen install).
- `use-push-subscription.ts` manages the browser subscription; each device is a `push_subscriptions` row that can be renamed or removed in [[Settings and profile]].
- `pwa-history-tracker.tsx` and `pwa-navigation.ts` handle back-navigation inside the standalone app.
- `pull_to_refresh.tsx` adds pull-to-refresh, since standalone mode has no browser reload button.
