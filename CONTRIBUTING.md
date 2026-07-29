# Contributing

This is a personal, self-hosted family project shared publicly in case it's useful to others — it isn't run as a community-driven open-source product, so don't expect fast turnaround, but bug reports and small, focused PRs are welcome.

## Running it locally

See the [README](README.md#-quick-start-local-dev) — `pnpm install`, a Supabase project (hosted or self-hosted), `.env.local`, `pnpm dev`.

## Code style / architecture

This codebase follows a specific set of conventions documented in [CLAUDE.md](CLAUDE.md) (Server Components by default, Server Actions for all mutations, auth checks via `getUser()` not `getSession()`, Pino logging, etc.) — written for [Claude Code](https://claude.com/claude-code) but equally applicable if you're reading the code by hand. Please follow them in PRs.

Before opening a PR:

```bash
pnpm typecheck
pnpm lint
```

Both run in CI on every PR, along with a sanity Docker build.

## License

By contributing, you agree your changes are licensed under this project's [PolyForm Noncommercial License](LICENSE) — noncommercial use, modification, and redistribution only.

## Reporting bugs / requesting features

Open a GitHub issue using the provided templates. If you're running the app itself (not reading the code), it also has a built-in bug-report button — but that goes to my own instance's inbox, not here, so please file issues about the *code* on GitHub.
