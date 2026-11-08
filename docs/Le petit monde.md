---
tags: [lepetitmonde, moc]
---

# Le petit monde

A private, self-hosted family app to share a baby's life (photos, stories, anecdotes, a birth-guessing game, a calendar, care tracking, health records) with a small, invite-only circle of relatives. Built with Next.js (App Router) and Supabase.

This note is the entry point of the documentation. Every note links back here, so the Obsidian graph shows three clusters around it: **architecture**, **features** and **guides**.

## Architecture

- [[Architecture overview]]: the big picture and a diagram of every moving part.
- [[Tech stack]]: frameworks, libraries and why they were chosen.
- [[Project structure]]: where things live in `src/`.
- [[Server and client split]]: Server Components, Server Actions, the few API routes.
- [[Core modules]]: the `*-core.ts` pattern shared by the web app and the MCP server.
- [[Authentication]]: Supabase Auth, sessions, the proxy, invitations.
- [[Authorization]]: baby membership, admin/viewer, circles, page settings.
- [[Row Level Security]]: what the database enforces today and what is still app-only.
- [[Data model]]: every table and how they relate.
- [[Storage and media]]: buckets, uploads, HEIC, the streaming proxy.
- [[Realtime]]: the Server-Sent Events relay.
- [[Notifications pipeline]]: in-app inbox, Web Push, email.
- [[MCP server]]: AI clients driving the app through `/api/mcp`.
- [[OAuth authorization server]]: OAuth 2.1 for Claude.ai, Gemini CLI and others.
- [[Security model]]: headers, rate limits, tokens, validation.
- [[Internationalization]]: French and English with next-intl.
- [[Logging]]: Pino child loggers.
- [[PWA and service worker]]: install, push display.
- [[UI system]]: Tailwind, Shadcn, Base UI, and the [[z-index]] scale.
- [[Build and deploy]]: CI, GHCR, Portainer, `:latest` vs `:prod`.

## Features

Each baby has a set of pages that an admin can turn on or off and restrict to admins (see [[Page settings]]).

- [[Feed]] with [[Stories]], [[Polls]], comments and reactions
- [[Guessing game]] (Pronostics)
- [[Calendar]]
- [[Anecdotes]]
- [[Albums]] and [[Share links]]
- [[Inventory]] and [[Buy list]]
- [[To-do list]]
- [[Baby tracker]] (sleep and feeds)
- [[Diaper changes]] (pee and poop in the tracker)
- [[Tracker analytics]] (trends and history for the tracker)
- [[Health]] (growth charts, vaccinations)
- [[Admin console]] (circles, invitations, members, bug reports)
- [[Onboarding]], [[Settings and profile]], [[Bug reports]]

## Guides

- [[Local development]]
- [[Database migrations]]
- [[Deploying]]
- [[Coding conventions]]
- [[Adding a feature]]

## Elsewhere in the repo

- `README.md`: setup and MCP client instructions.
- `CLAUDE.md` / `AGENTS.md`: rules for AI agents working on the code.
- `CHANGELOG.md`: every commit, grouped by day.
- `.claude/plans/`: feature plans; shipped ones move to `.claude/plans/done/` (mirrored in the vault under `plans/`).
