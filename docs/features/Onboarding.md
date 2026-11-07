---
tags: [lepetitmonde/feature]
---

# Onboarding

Up: [[Le petit monde]] · Route: `/baby/[babyId]/onboarding` · Code: `components/onboarding-form.tsx`, `actions/onboarding.ts`

Shown once, right after a guest joins through an invitation ([[Authentication]]):

1. Nickname and relation to the baby (stored on `baby_access`).
2. Push notification opt-in, with an "Add to Home Screen" card on iOS where push requires an installed app ([[PWA and service worker]]).

Skipping it is allowed; the notification bell re-prompts later until the user declines explicitly (then it waits 30 days).
