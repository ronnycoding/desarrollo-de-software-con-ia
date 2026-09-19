---
id: "01-01"
title: "[Sub-issue] API de chat streaming con DeepSeek"
labels: ["sub-issue", "backend", "story-points:8"]
story_points: 8
assignee: "backend-architect"
priority: "P0"
epic: "PARENT"
dependencies: []
---

# [SUB-ISSUE] API de chat streaming con DeepSeek

## 🔗 Parent Issue
Part of #PARENT - [EPIC] Chatbot con DeepSeek (API compatible Anthropic)

## 👤 Assignment
**Assigned Agent/Team Member**: @backend-architect
**Specialization**: backend-architect (apoyo: @ai-engineer en cliente/prompts; revisión: @code-reviewer, @security-auditor)
**Story Points**: 8

## 🛠️ Skills & Tooling
**Claude Code Skills**: `claude-api` (SDK `@anthropic-ai/sdk`: cliente, `messages.stream`, `finalMessage`, tipos y errores)
**Custom Skill Needed**: Recomendada `deepseek-anthropic-compat` (ver #PARENT) — no bloqueante
**Skill Usage**: With Agent

## 📋 Summary
Añadir la capa de IA del proyecto: variables de entorno `DEEPSEEK_*`, un cliente `@anthropic-ai/sdk` apuntando al endpoint compatible de DeepSeek, un schema zod para la petición de chat y el route handler `POST /api/chat` que exige sesión de Better Auth y devuelve la respuesta del asistente como texto plano streameado. Este sub-issue fija el contrato que consumen #01-02, #A-03 y #C-01.

**Metodología del workshop**: Issue-Driven (`/issue` → `/task` → `/pr` → `/code-review`), ver `prompts/01-issue-driven.md`.

## 🎯 Scope
### In Scope
- `bun add @anthropic-ai/sdk`
- `src/env.js` + `.env.example`: `DEEPSEEK_API_KEY` (requerida), `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com/anthropic`), `DEEPSEEK_MODEL` (default `deepseek-flash`)
- `src/server/ai/deepseek.ts` — cliente y constantes
- `src/server/ai/prompts.ts` — `DEFAULT_SYSTEM_PROMPT`
- `src/server/ai/chat-schema.ts` — `chatRequestSchema`, tipos `ChatMessage`, `ChatRequest`
- `src/app/api/chat/route.ts` — handler `POST` streaming con guard de sesión
- Sección "AI (`src/server/ai/`)" en `CLAUDE.md`

### Out of Scope
- UI de chat (#01-02)
- Persistencia de conversaciones, `conversationId`, `X-Conversation-Id` (#A-03)
- Rate limit (#C-01), system prompt por conversación (#C-02), tests automatizados (#C-03)

## 🔧 Technical Details
### Implementation Approach

**Env (`src/env.js`, bloque `server` y `runtimeEnv`):**
```js
DEEPSEEK_API_KEY: z.string().min(1),
DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com/anthropic"),
DEEPSEEK_MODEL: z.string().min(1).default("deepseek-flash"),
```
`emptyStringAsUndefined: true` ya hace que `DEEPSEEK_BASE_URL=""` caiga al default. Nota: `drizzle.config.ts` importa `~/env`, así que `bun run db:push` también exigirá `DEEPSEEK_API_KEY` (o `SKIP_ENV_VALIDATION=1`).

**Cliente (`src/server/ai/deepseek.ts`):**
```ts
import Anthropic from "@anthropic-ai/sdk";
import { env } from "~/env";

export const deepseek = new Anthropic({
	apiKey: env.DEEPSEEK_API_KEY,
	baseURL: env.DEEPSEEK_BASE_URL,
});
export const DEEPSEEK_MODEL = env.DEEPSEEK_MODEL;
export const DEFAULT_MAX_TOKENS = 4096;
```
Pasar `apiKey` y `baseURL` explícitos; si no, el SDK cae a `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`.

**Parámetros permitidos hacia DeepSeek**: solo `model`, `max_tokens`, `system`, `messages`, `temperature` (opcional). **No enviar** `top_k`, `thinking`, `output_config`, `cache_control`, `betas`, `fallbacks`, `mcp_servers`: el endpoint devuelve 400 ante campos desconocidos. Usar `Anthropic.MessageParam[]` para los mensajes (no definir un tipo paralelo).

**Schema (`src/server/ai/chat-schema.ts`)** — importa solo `zod` (lo consume el client component de #01-02):
```ts
messages: 1..50 items, cada uno { role: "user" | "assistant", content: string 1..8000 }
regla: el último mensaje debe ser role "user"
conversationId?: uuid  // se ignora en este slice; lo usa #A-03
```

**Route handler (`src/app/api/chat/route.ts`)**, runtime Node (no `edge`: `postgres` y Better Auth lo requieren):
1. `const session = await getSession()` de `~/server/better-auth/server` **antes** de construir el stream → 401 JSON si no hay sesión.
2. `chatRequestSchema.safeParse(await req.json())` → 400 JSON con `issues`.
3. `const stream = deepseek.messages.stream({ model, max_tokens, system: DEFAULT_SYSTEM_PROMPT, messages }, { signal: req.signal })`.
4. `new ReadableStream<Uint8Array>` que en `start()` itera `for await (const event of stream)` y encola `TextEncoder().encode(event.delta.text)` cuando `event.type === "content_block_delta" && event.delta.type === "text_delta"`; al terminar `await stream.finalMessage()` y `controller.close()`. En `cancel()` llamar `stream.abort()`.
5. `Anthropic.APIError` antes de emitir el primer byte → 502 JSON; fallo a mitad de stream → `controller.error(err)`.
6. Headers: `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.

**Contrato `POST /api/chat`:**
| Status | Body | Headers |
| ------ | ---- | ------- |
| 200 | texto del asistente streameado | `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no` |
| 400 | `{ error: "Invalid request", issues: ZodIssue[] }` | |
| 401 | `{ error: "Unauthorized" }` | |
| 502 | `{ error: "Upstream error" }` | |

**Tiers para `/task`:**
- Tier 0 (paralelo): **T1** env + dependencia + `deepseek.ts` + `prompts.ts` — @ai-engineer, 2 SP. **T2** `chat-schema.ts` — @backend-architect, 1 SP.
- Tier 1: **T3** `route.ts` streaming + guard de sesión — @backend-architect, 5 SP.
- Tier 2: **T4** revisión del diff — @code-reviewer + @security-auditor (API key nunca en logs, 401 antes de cualquier llamada upstream, límite de tamaño de body). Incluido en los 8 SP.

### Dependencies
- **Blocked by**: ninguno
- **Blocks**: #01-02, #A-01, #C-01
- **External dependencies**: `@anthropic-ai/sdk` ^0.127, cuenta y API key de DeepSeek (https://platform.deepseek.com/api_keys)

### Interface Definition
```yaml
inputs:
  - method: POST /api/chat
  - cookie: better-auth.session_token (sesión válida)
  - body.messages: Array<{ role: "user" | "assistant"; content: string }>, 1..50, último role "user"
  - body.conversationId: string uuid, opcional (ignorado en este slice)
outputs:
  - 200: ReadableStream<Uint8Array> de texto plano (deltas del asistente)
  - 400 | 401 | 502: JSON { error: string, issues?: ZodIssue[] }
exports:
  - src/server/ai/deepseek.ts: deepseek, DEEPSEEK_MODEL, DEFAULT_MAX_TOKENS
  - src/server/ai/prompts.ts: DEFAULT_SYSTEM_PROMPT
  - src/server/ai/chat-schema.ts: chatRequestSchema, ChatMessage, ChatRequest
```

### Integration Points
- **Receives from**: Better Auth (`getSession()` en `src/server/better-auth/server.ts`) — sesión del usuario; `src/env.js` — credenciales DeepSeek
- **Provides to**: #01-02 — contrato HTTP y tipo `ChatMessage`; #A-03 — punto de extensión para persistencia; #C-01 — punto de inserción del rate limit tras el guard de sesión

## ✅ Acceptance Criteria
- [ ] `bun run typecheck` y `bun run check` pasan
- [ ] `curl -N -X POST localhost:3000/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"hi"}]}'` devuelve 401 JSON
- [ ] La misma petición con cookie `better-auth.session_token` (copiada de DevTools tras iniciar sesión en `/`) streamea texto progresivamente (`-N` muestra chunks llegando)
- [ ] Body inválido (`messages` vacío, último role `assistant`) devuelve 400 con `issues` de zod
- [ ] Sin `DEEPSEEK_API_KEY`, `bun dev` falla en la validación de env con mensaje claro
- [ ] `DEEPSEEK_API_KEY` no aparece en ningún `console.*` ni en la respuesta
- [ ] `CLAUDE.md` documenta `src/server/ai/` y las nuevas variables
- [ ] `/code-review` sin hallazgos críticos
- [ ] Interface contract validado por #01-02

## 🧪 Testing Strategy
### Unit Tests
- (Diferido a #C-03) `chatRequestSchema`: acepta 1..50 mensajes, rechaza vacío, rechaza último role `assistant`, rechaza content > 8000

### Integration Tests
- Manual con `curl -N` (401, 400, 200 streaming) según los criterios de aceptación
- Verificar con `curl -v` que los headers `Cache-Control` y `X-Accel-Buffering` están presentes

## 📎 Additional Context
### Related Issues
- Depends on: ninguno
- Related to: #PARENT, #01-02, #A-03, #C-01

### References
- [DeepSeek — Anthropic API compatibility](https://api-docs.deepseek.com/guides/anthropic_api)
- Skill `claude-api` → `typescript/claude-api/streaming.md`
- `src/app/page.tsx` — patrón de server actions y `redirect("/?error=...")`

### Technical Notes
- No usar tRPC ni Vercel AI SDK: SDK de Anthropic plano.
- No llamar `getSession()`/`headers()` después de iniciar la respuesta.
- `max_tokens` inicial 4096; un valor por encima del tope de DeepSeek produce 400 inmediato.
- Si `deepseek-flash` devolviera 404, cambiar `DEEPSEEK_MODEL` en `.env` sin tocar código.
- Biome: tabs, `import type` (`verbatimModuleSyntax`), imports organizados. Ejecutar `bun run check:write` antes de commitear.

## 🏷️ Labels
`sub-issue`, `backend`, `P0`, `story-points:8`

## 📅 Timeline
- **Start**: pre-workshop (S1 se ejecuta antes de la sesión o en la demo 1)
- **Target Completion**: antes de #01-02
- **Estimated**: 8 story points

## 🤝 Handoff Checklist
- [ ] Interface contract documented (tabla de status/headers en este issue)
- [ ] API endpoints/methods documented (`POST /api/chat` en `CLAUDE.md`)
- [ ] Data models/schemas defined (`chat-schema.ts` exportado)
- [ ] Error handling patterns established (400/401/502 JSON; error mid-stream cierra el stream)
- [ ] Integration points validated (`curl -N` con cookie real)
- [ ] Handoff notes for dependent teams/agents: #01-02 consume `ChatMessage` desde `chat-schema.ts`; #A-03 extiende `route.ts` sin cambiar el contrato
