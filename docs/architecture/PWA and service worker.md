---
tags: [lepetitmonde/architecture]
---

# PWA and service worker

Up: [[Le petit monde]] · See also [[Notifications pipeline]], [[Onboarding]]

- **Installable** on iOS and Android home screens: `src/app/manifest.ts` (icons and screenshots in `public/`).
- **Service worker**: `public/sw.js` is the only source (no build step; `src/worker/` was removed). It is registered once, by `PwaRegistry` in the root layout. It displays push notifications, opens the right page on click, and serves a static offline fallback: on a navigation that fails, takes over 6 s to first byte, or returns 502-504 / 520-530, it answers with the precached `/offline/index.html`. Everything else (API, RSC, Server Actions, SSE, chunks) is never intercepted, and authenticated responses are never cached. The cache name carries the commit SHA, stamped into `sw.js` by the Dockerfile before the build.
- `proxy.ts` lets `manifest.webmanifest`, `sw.js` and `offline/` through without a session, otherwise the browser would receive an HTML login redirect.
- `src/components/install-card.tsx` gives platform-specific instructions: the native prompt on Chrome/Android, the Share-sheet steps on iOS (where push needs a home-screen install).
- `use-push-subscription.ts` manages the browser subscription; each device is a `push_subscriptions` row that can be renamed or removed in [[Settings and profile]].
- `pwa-history-tracker.tsx` and `pwa-navigation.ts` handle back-navigation inside the standalone app.
- `pull_to_refresh.tsx` adds pull-to-refresh, since standalone mode has no browser reload button.
