# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

T3-stack app (`create-t3-app` 7.40) using Next.js 15 App Router, React 19, Better Auth, Drizzle ORM on Postgres, Tailwind CSS v4, and Biome. Package manager is **Bun** (`bun.lock`). No tests exist yet.

## Commands

```bash
bun install                 # deps
bun dev                     # next dev --turbo
bun run build               # next build (runs env validation via next.config.js)
bun run preview             # build + start
bun run typecheck           # tsc --noEmit
bun run check               # biome lint + format check
bun run check:write         # biome auto-fix (safe)
bun run check:unsafe        # biome auto-fix incl. unsafe fixes

# Database (Postgres on localhost:5434)
docker compose up -d        # preferred: postgres:17-alpine, creds from .env / defaults
./start-database.sh         # alternative: parses DATABASE_URL, runs a plain docker container
bun run db:push             # push schema directly (dev)
bun run db:generate         # generate migration SQL
bun run db:migrate          # apply migrations
bun run db:studio           # drizzle-kit studio
```

Set `SKIP_ENV_VALIDATION=1` to bypass env checks during `build`/`dev` (e.g. Docker builds).

## Environment

`src/env.js` is the single source of truth for env vars (`@t3-oss/env-nextjs` + zod). Add any new variable there **and** in `.env.example`. Import via `import { env } from "~/env"`, never `process.env` directly. `BETTER_AUTH_SECRET` is optional in dev, required in production.

## Architecture

- `~/*` aliases `./src/*`.
- **Auth (`src/server/better-auth/`)**: `config.ts` builds the `betterAuth` instance with the Drizzle `pg` adapter and email/password enabled. `nextCookies()` must remain the **last** plugin so server actions can set session cookies. `server.ts` exports a React-`cache`d `getSession()` for server components. `client.ts` is the browser client (`better-auth/react`). The catch-all route `src/app/api/auth/[...all]/route.ts` exposes Better Auth's handler.
- **Auth flow in pages**: `src/app/page.tsx` uses inline `"use server"` actions calling `auth.api.signInEmail` / `signUpEmail` / `signOut` with `headers()` passed through, then `redirect()` with `?error=` on failure. Follow this pattern rather than client-side auth calls for server-rendered forms.
- **DB (`src/server/db/`)**: `index.ts` caches the `postgres` connection on `globalThis` outside production to survive HMR. `schema.ts` holds both app tables and the Better Auth tables (`user`, `session`, `account`, `verification`) whose column names Better Auth expects; changing them requires updating the adapter config.

## Known gotcha: table prefix mismatch

`drizzle.config.ts` sets `tablesFilter: ["desarrollo-de-software-con-ia_*"]`, but `schema.ts` creates app tables with `pgTableCreator` prefix `pg-drizzle_` and the Better Auth tables with plain `pgTable` (no prefix). None of the current tables match the filter, so `db:push` / `db:generate` may ignore them. Align either the filter or the prefix before relying on drizzle-kit.

## Code style

Biome (tabs, recommended rules, organized imports, sorted JSX attributes). Tailwind classes are sorted via the `useSortedClasses` rule for `clsx`/`cva`/`cn`. TypeScript is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type`).
