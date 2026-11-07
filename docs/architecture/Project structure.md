---
tags: [lepetitmonde/architecture]
---

# Project structure

Up: [[Le petit monde]] · See also [[Architecture overview]]

```
src/
  proxy.ts                      # Next 16 middleware: session refresh, login redirects
  app/
    layout.tsx, page.tsx        # Root layout; home = landing page or baby picker
    _header/                    # Site header, nav, notification bell, mobile bottom bar
    _home/                      # Logged-out landing page
    (auth)/                     # login, signup, forgot/reset password, invite, oauth/authorize
    auth/confirm/               # Supabase email link callback (OTP, recovery)
    baby/[babyId]/              # Everything scoped to one baby
      page.tsx                  # Baby landing page (sections from the page registry)
      feed/ calendar/ guess/ anecdotes/ albums/ inventory/ buy-list/ todo/ tracker/ health/
      admin/                    # Circles, invitations, members, page settings, bug reports
      onboarding/               # First-run profile + push opt-in
    settings/, profile/         # Account, devices, connected apps (MCP tokens, OAuth)
    share/[token]/              # Public share-link page (no account)
    api/
      upload/                   # Streaming upload into Storage
      storage/[babyId]/[...path]# Media proxy with HTTP Range
      realtime/[babyId]/        # Server-Sent Events relay
      share/[token]/[photoId]/  # Public photo bytes for a share link
      bug-reports/[...path]/    # Screenshot proxy (admins)
      mcp/ + mcp/tools/         # MCP endpoint and its tools
      oauth/{register,token,revoke}/
      vitals/                   # Optional web-vitals collection
    .well-known/                # OAuth discovery metadata
  components/                   # Shared components; ui/ = Shadcn primitives
  utils/
    actions/                    # Server Actions ('use server')
    *-core.ts                   # Shared business rules (see Core modules)
    supabase/                   # Client factories, generated types, realtime relay
    oauth/                      # OAuth 2.1 server internals
    hooks/                      # Client hooks (realtime, push, time zone)
    cache/                      # Small TTL cache
  i18n/                         # next-intl config
  worker/index.ts               # Service worker source (mirrored to public/sw.js)
messages/                       # fr.json, en.json
supabase/migrations/            # SQL migrations, timestamped
public/                         # Icons, screenshots, sw.js, email templates
docs/                           # This documentation (mirrored to Obsidian)
.claude/plans/                  # Feature plans; done/ once shipped
.github/workflows/ci.yml        # Typecheck, lint, multi-arch image build
```

Path aliases (`tsconfig.json`): `@/*` → `src/*`, `@utils/*` → `src/utils/*`, `@components/*` → `src/components/*`.

Conventions inside a feature folder: `page.tsx` (Server Component), `loading.tsx`, and a `_components/` folder for the feature's own client and server components. See [[Coding conventions]].
