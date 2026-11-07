---
tags: [lepetitmonde/architecture]
---

# Internationalization

Up: [[Le petit monde]] · See also [[Coding conventions]]

- Library: **next-intl**, configured in `src/i18n/config.ts` and `src/i18n/request.ts`.
- Locales: `fr` (default) and `en`. The locale is set **per deployment** with the `DEFAULT_LOCALE` env var (`resolveLocale()`), not per user or URL.
- Messages: `messages/fr.json` and `messages/en.json`. Every user-visible string goes through them; both files must get every new key.
- Server code uses `getTranslations()`, client code `useTranslations()`.
- Server Actions return error **codes** that map to `serverErrors.*` keys.
- Page names and descriptions come from `pages.<id>.*` keys, resolved in `getPageSettings` ([[Page settings]]).
- French typography: use non-breaking spaces inside « » and before `:`, `?`, `!`.

## Time zones

Timestamps are stored in UTC. The display zone comes from a `tz` cookie set by `src/components/tz_cookie.tsx` from the device, falling back to `FAMILY_TIME_ZONE` (`Europe/Paris`). Quiet hours and some server-side formatting use `FAMILY_TIME_ZONE` directly.
