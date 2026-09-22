# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

T3-stack app (`create-t3-app` 7.40) using Next.js 15 App Router, React 19, Better Auth, Drizzle ORM on Postgres, Tailwind CSS v4, and Biome. Package manager is **Bun** (`bun.lock`); tests run on `bun test`.

The product is an authenticated streaming chatbot backed by DeepSeek. The repo doubles as the live demo for a workshop on AI-assisted development, which is why `issues/`, `prompts/`, `tech-stack/` and `mvp-requirements.md` are committed alongside the app — see "Workshop material" below.

## Commands

```bash
bun install                 # deps — rerun after switching branches, stale
                            # node_modules surfaces as TS2307 "cannot find module"
bun dev                     # next dev --turbo
bun run build               # next build (runs env validation via next.config.js)
bun run preview             # build + start
bun run typecheck           # tsc --noEmit
bun run check               # biome lint + format check
bun run check:write         # biome auto-fix (safe)
bun run check:unsafe        # biome auto-fix incl. unsafe fixes

# Tests
bun test                                    # whole suite
bun test src/server/ai                      # one directory
bun test src/server/ai/rate-limit.test.ts   # one file
bun test -t "window expires"                # one test by name substring

# Database
docker compose up -d        # preferred: postgres:17-alpine, creds from .env / defaults
./start-database.sh         # alternative: parses DATABASE_URL, runs a plain docker container
bun run db:push             # push schema directly (dev)
bun run db:generate         # generate migration SQL into drizzle/
bun run db:migrate          # apply migrations
bun run db:studio           # drizzle-kit studio
```

Set `SKIP_ENV_VALIDATION=1` to bypass env checks during `build`/`dev` (e.g. Docker builds, or any machine whose `.env` lacks `DEEPSEEK_API_KEY`).

### Testing notes

`bunfig.toml` preloads `src/test/setup.ts` before every test file. That file sets `SKIP_ENV_VALIDATION`, `DATABASE_URL` and `DEEPSEEK_API_KEY` with `??=`, so a real `.env` always wins and CI still gets usable defaults.

Two kinds of test live here, and the distinction matters when one fails:

- `src/server/ai/*.test.ts` are pure. They need nothing running.
- `src/server/chat/conversations.test.ts` hits a **real Postgres** and asserts the per-user isolation invariant. With no database up it fails with `ECONNREFUSED`, which is an environment problem, not a regression. Bring the database up and `bun run db:push` before reading anything into those failures.

`checkRateLimit` takes `now` as a parameter instead of reading `Date.now()` internally, specifically so window-expiry tests need no fake clock.

## Environment

`src/env.js` is the single source of truth for env vars (`@t3-oss/env-nextjs` + zod). Add any new variable there **and** in `.env.example`. Import via `import { env } from "~/env"`, never `process.env` directly. `BETTER_AUTH_SECRET` is optional in dev, required in production. `DEEPSEEK_API_KEY` is required; `DEEPSEEK_BASE_URL` defaults to `https://api.deepseek.com/anthropic`, `DEEPSEEK_MODEL` to `deepseek-flash`, and `CHAT_RATE_LIMIT_PER_MINUTE` to 20. Because `drizzle.config.ts` imports `~/env`, the `db:*` scripts also require `DEEPSEEK_API_KEY` (or `SKIP_ENV_VALIDATION=1`).

**A zod `.default()` is not a runtime guarantee.** `skipValidation` bypasses zod entirely, so any defaulted variable reads back as `undefined` whenever `SKIP_ENV_VALIDATION=1` is set — including in every test run. `rate-limit.ts` resolves `CHAT_RATE_LIMIT_PER_MINUTE` through an explicit `Number.isInteger` check for exactly this reason: `length >= undefined` is always false, which would have silently disabled the limit instead of failing loudly. Apply the same pattern to any new defaulted numeric variable.

### Known inconsistency: the Postgres port

The container actually listens on **5434** (`docker-compose.yml` maps `${POSTGRES_PORT:-5434}:5432`). But `.env.example` and the `DATABASE_URL` fallback in `src/test/setup.ts` both still say **5464**. Copying `.env.example` verbatim therefore produces a URL pointing at no database, and CI without an explicit `DATABASE_URL` connects to the wrong port. `mvp-requirements.md` and `tech-stack/infrastructure.md` both log this as an open defect. Align all four files rather than adding a fifth port.

## Architecture

- `~/*` aliases `./src/*`.
- **Auth (`src/server/better-auth/`)**: `config.ts` builds the `betterAuth` instance with the Drizzle `pg` adapter and email/password enabled. `nextCookies()` must remain the **last** plugin so server actions can set session cookies. `server.ts` exports a React-`cache`d `getSession()` for server components. `client.ts` is the browser client (`better-auth/react`). The catch-all route `src/app/api/auth/[...all]/route.ts` exposes Better Auth's handler.
- **Auth flow in pages**: `src/app/page.tsx` uses inline `"use server"` actions calling `auth.api.signInEmail` / `signUpEmail` / `signOut` with `headers()` passed through, then `redirect()` with `?error=` on failure. Follow this pattern rather than client-side auth calls for server-rendered forms.
- **DB (`src/server/db/`)**: `index.ts` caches the `postgres` connection on `globalThis` outside production to survive HMR. `schema.ts` holds both app tables and the Better Auth tables (`user`, `session`, `account`, `verification`) whose column names Better Auth expects; changing them requires updating the adapter config. `message.role` is a plain `text` column with a TypeScript-level enum rather than a `pgEnum`, because an unprefixed Postgres enum type would collide across worktrees sharing one database.
- **AI (`src/server/ai/`)**: `deepseek.ts` builds the `@anthropic-ai/sdk` client against DeepSeek's Anthropic-compatible endpoint — `apiKey` and `baseURL` are passed explicitly so the SDK never falls back to `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`; it also exports `DEEPSEEK_MODEL` and `DEFAULT_MAX_TOKENS` (4096). `prompts.ts` holds `DEFAULT_SYSTEM_PROMPT` as a plain string. Only `model`, `max_tokens`, `system`, `messages` and `temperature` may be sent: DeepSeek answers 400 to `top_k`, `thinking`, `output_config`, `cache_control`, `betas`, `fallbacks` and `mcp_servers`. Use the SDK's own types (`Anthropic.MessageParam`) instead of redeclaring them, and keep these modules server-only (Node runtime, never edge).
- **`chat-schema.ts` is the one module both sides import.** It pulls in `zod` and nothing else on purpose: client components import `ChatMessage` from it, so a `~/server/*` or SDK import there would drag the DeepSeek client and its API key into the browser bundle.

### Ownership invariant

`src/server/chat/conversations.ts` is the only module allowed to touch the `conversation` and `message` tables. Every exported function takes `userId` as its first argument and filters by it in the query itself, so isolation between users lives in one file rather than being re-checked at each call site. A missing row and a row owned by someone else are deliberately indistinguishable to callers: reads return `null` or `[]`, `deleteConversation` returns `false`, and only `createConversation` throws. Routes and pages translate that into a 404 or `notFound()`. Never query those two tables directly from a route, page or action.

### Chat endpoint (`src/app/api/chat/route.ts`)

`POST /api/chat`, `runtime = "nodejs"` (Better Auth and the Postgres driver both need Node APIs). The ordering is load-bearing:

1. `getSession()` — it reads `headers()`, unusable once the response has started, and an anonymous request must never spend provider tokens.
2. `checkRateLimit(session.user.id)` — before the body is even read, so a client over quota pays for no parsing.
3. `readBoundedBody` — App Router has no equivalent of the Pages router's `bodyParser.sizeLimit`, so the read is bounded by hand at `MAX_BODY_BYTES`; `Content-Length` is only a shortcut because it is client-supplied.
4. `chatRequestSchema.safeParse`.
5. Resolve or create the conversation, and persist the user message, before opening the stream.

The handler then drains events up to the first text delta **before** returning a `Response`, because once the 200 is on the wire the status can no longer change — that window is the only place an upstream failure can still become a 502. Catch order matters: `APIUserAbortError` before `AnthropicError`, since the former extends it and a client hanging up is not an upstream fault. Catch `AnthropicError` rather than `APIError`, because the SDK re-wraps a connection dropped mid-SSE into a bare `AnthropicError` that an `APIError` check would miss, letting it escape as a 500 HTML page.

`FIRST_TOKEN_TIMEOUT_MS` (60s) bounds the wait for a first token; the SDK's own timeout stops at response headers and would let a silent provider hang the handler forever. One `AbortController` serves both cancellation paths, and a `timedOut` flag distinguishes them, because the SDK reports either as an abort.

Statuses: 200 streamed `text/plain` with `X-Conversation-Id`, 400 `{ error, issues }` (also for an oversized or unparseable body), 401, 404 for an unknown or foreign conversation, 429 with `Retry-After`, 502, plus a 499 with no body when the client hangs up before the first token and nothing is left to read. `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` are both required or proxies buffer the whole body.

Once streaming, a mid-stream failure can only `controller.error()`. `cancel()` sets `clientGone`, calls `stream.abort()` so the upstream request dies with the client, and fire-and-forgets a partial-reply save — the platform cannot await `cancel()`, so that persistence is a courtesy to the next page load, not part of the response.

### Rate limiting (`src/server/ai/rate-limit.ts`)

In-memory sliding window keyed by `userId`, not by conversation, so switching conversations cannot evade it. Counters are cached on `globalThis` (same pattern as the DB connection) to survive HMR. Per-process and therefore single-instance only: a multi-instance deployment needs a shared store.

### Chat UI (`src/app/chat/`)

- `layout.tsx` wraps both `/chat` and `/chat/[conversationId]`, duplicating the session guard because it needs `session.user.id` to list conversations itself. It renders the sidebar and contributes only a flex row — `children` renders its own `<main>`, so wrapping it in a second one would nest landmarks.
- **Server actions live in `src/server/chat/actions.ts`** (rename, delete, update system prompt), each re-validating with zod and relying on the repository's ownership filter. The `ActionState` type and `initialActionState` live in the separate `action-state.ts` because a module with a top-level `"use server"` may only export async functions, and `initialActionState` is a value.
- Rename and delete end with `revalidatePath("/chat", "layout")`, which is what re-runs `listConversations` in the layout. The system-prompt action revalidates only its own conversation path.
- `delete` calls `redirect()` outside any try/catch on purpose: `redirect()` throws a Next.js control-flow exception that must propagate, or the action would report a false error.
- `chat-panel.tsx` is the streaming client. It keeps the conversation id in a ref, not state, because `sendMessage` must read it synchronously; the id arrives either from props or from the first response's `X-Conversation-Id`.
- **Assistant replies render as markdown** through `markdown-message.tsx` (`react-markdown` + `remark-gfm`), which builds a React element tree instead of setting `innerHTML`. Model output is untrusted, so raw HTML in a reply stays inert visible text and the default `urlTransform` strips `javascript:` targets. **Do not add `rehype-raw`** — it removes both protections, and `markdown-message.test.tsx` fails if anyone does. User messages are deliberately not parsed as markdown, so typing `# hi` shows `# hi`. The assistant bubble is a `<div>`, not a `<p>`, because markdown emits block elements the parser would otherwise hoist out mid-stream. This is also why the assistant bubble drops `whitespace-pre-wrap`, which would double every paragraph gap. Expect partial markdown: the component re-renders on every streamed chunk.

## Resolved gotcha: table prefix mismatch

`drizzle.config.ts` previously set `tablesFilter: ["desarrollo-de-software-con-ia_*"]`, which matched none of the actual tables: `schema.ts` creates app tables with `pgTableCreator` prefix `pg-drizzle_` and the Better Auth tables with plain `pgTable` (no prefix). `tablesFilter` is now `["pg-drizzle_*", "user", "session", "account", "verification"]`, covering both patterns. Keep it in sync with `schema.ts` — on a Postgres instance shared across worktrees, an empty or stale filter would let `db:push` propose dropping tables this project doesn't own.

## Workshop material

These directories are content, not application code, but the slash-command workflows read them:

- `issues/` — the markdown source of truth for the parent issue, three epics (A persistence, B sidebar, C settings/rate-limit/tests) and their sub-issues. GitHub issues are published from here.
- `prompts/` — ready-to-paste Spanish prompts, one per methodology, plus `scripts/publish-epics.sh`.
- `tech-stack/` and `mvp-requirements.md` — architecture write-ups and Mermaid diagrams, including a risk table that tracks known defects such as the port mismatch above.

The frozen API contract each slice implements lives in `issues/parent-chatbot-deepseek.md`. Consult it before changing anything in the chat endpoint's request or response shape.

## Code style

Biome (tabs, recommended rules, organized imports, sorted JSX attributes). Tailwind classes are sorted via the `useSortedClasses` rule for `clsx`/`cva`/`cn`. TypeScript is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type`).

`noUncheckedIndexedAccess` is why several places carry a `?? fallback` or an explicit non-empty check that looks redundant next to a zod `min(1)` or an array length guard — the type system cannot see those invariants. Keep the fallback rather than asserting with `!`.
