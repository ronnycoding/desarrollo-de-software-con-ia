# Backend Architecture

**Domain:** Backend
**Primary Technology:** Next.js Route Handlers + Server Actions (Node runtime)
**Last Updated:** 2026-09-19

---

## Technology Stack

### Language & Runtime
- **Runtime:** Node (**no** `edge`) — requerido por `postgres.js` y Better Auth
- **Language:** TypeScript ^5.8.2 estricto
- **Package manager / test runner:** Bun

### Framework
No hay framework backend separado. El backend son dos mecanismos de Next.js 15:

| Mecanismo | Archivo | Uso |
| --------- | ------- | --- |
| Route Handler | `src/app/api/chat/route.ts` | streaming del LLM (única forma de devolver texto incremental) |
| Route Handler | `src/app/api/auth/[...all]/route.ts` | handler catch-all de Better Auth |
| Server Actions | `src/server/chat/actions.ts` | rename, delete, system prompt |
| Server Actions inline | `src/app/page.tsx` | sign in / sign up / sign out |

**Sin tRPC** (aunque el scaffolding T3 lo contemple) y **sin Vercel AI SDK**: el contrato HTTP se mantiene explícito y verificable con `curl`.

### API Style
REST mínimo (un endpoint) + RPC vía server actions. Sin GraphQL, sin WebSocket.

### Validation & Schema
- **zod** ^3.24 para todo input externo
- `src/server/ai/chat-schema.ts` — `chatRequestSchema`, tipos `ChatMessage` y `ChatRequest`; importa **solo** zod para poder consumirse desde el cliente
- Las server actions validan `FormData` con zod dentro de la propia action

---

## Project Structure

```
src/server/
├── ai/
│   ├── deepseek.ts        # cliente Anthropic SDK → DeepSeek + constantes
│   ├── prompts.ts         # DEFAULT_SYSTEM_PROMPT (fallback documentado)
│   ├── chat-schema.ts     # zod: chatRequestSchema, ChatMessage, ChatRequest
│   └── rate-limit.ts      # checkRateLimit en memoria (#C-01)
├── chat/
│   ├── conversations.ts   # repositorio user-scoped (#A-02)
│   ├── conversations.test.ts
│   └── actions.ts         # server actions rename/delete/system prompt (#B-01, #C-02)
├── better-auth/
│   ├── config.ts          # instancia betterAuth
│   ├── index.ts           # re-export
│   ├── client.ts          # cliente de navegador
│   └── server.ts          # getSession() cacheado
└── db/
    ├── index.ts           # conexión postgres.js cacheada en globalThis
    └── schema.ts          # tablas Better Auth + dominio
```

---

## Route Handler `POST /api/chat`

Orden de ejecución, **todo antes de construir el `ReadableStream`**:

1. `const session = await getSession()` → sin sesión: `401 { error: "Unauthorized" }`. Antes de cualquier llamada upstream, para que una petición anónima nunca gaste tokens.
2. `checkRateLimit(session.user.id)` → `429 { error: "Rate limited" }` con header `Retry-After`.
3. `chatRequestSchema.safeParse(await req.json())` → `400 { error: "Invalid request", issues }`.
4. Ownership: si llega `conversationId`, `getConversation(userId, id)`; `null` → `404 { error: "Conversation not found" }`. Si no llega, `createConversation(userId, title)` con el último mensaje de usuario recortado a 60 caracteres como título.
5. `appendMessage(userId, conversationId, "user", lastUserMessage.content)`.
6. `const system = conversation.systemPrompt ?? DEFAULT_SYSTEM_PROMPT`.
7. `const stream = deepseek.messages.stream({ model, max_tokens, system, messages }, { signal: req.signal })`.
8. `new ReadableStream<Uint8Array>`:
   - `start()`: `for await (const event of stream)`; si `event.type === "content_block_delta" && event.delta.type === "text_delta"`, encolar `new TextEncoder().encode(event.delta.text)`.
   - Al terminar: `const final = await stream.finalMessage()`, concatenar los bloques `text`, `appendMessage(userId, conversationId, "assistant", text)` y `controller.close()`.
   - `cancel()`: `stream.abort()` y persistir el texto parcial acumulado.
9. Errores: `Anthropic.APIError` **antes** del primer byte → `502 { error: "Upstream error" }`; fallo a mitad de stream → `controller.error(err)` (el cliente ve la conexión cortarse).
10. Headers de la respuesta 200: `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `X-Conversation-Id: <uuid>`.

**Regla dura:** no llamar a `getSession()` ni a `headers()` después de haber empezado la respuesta.

Contrato completo y ejemplos con `curl` en [api.md](./api.md).

---

## Server Actions (`src/server/chat/actions.ts`)

```ts
type ActionState = { ok: true } | { ok: false; error: string };

renameConversationAction(prevState, formData)     // conversationId uuid, title 1..120
deleteConversationAction(prevState, formData)     // conversationId uuid
updateSystemPromptAction(prevState, formData)     // conversationId uuid, systemPrompt 0..4000 ("" → null)
```

Patrón común:
1. `"use server"` en la cabecera del módulo
2. `const session = await getSession()` → `{ ok: false, error: "Unauthorized" }` si no hay
3. zod sobre `FormData`
4. llamada a la función del repositorio con `userId` primero
5. `revalidatePath("/chat", "layout")` para refrescar el sidebar; `revalidatePath("/chat/<id>")` para settings
6. devolver `ActionState` (las páginas lo consumen con `useActionState`)

Las actions **no** streamean: ese es el motivo de que el chat sea un Route Handler.

---

## Repositorio de datos (`src/server/chat/conversations.ts`)

Única puerta al dominio de datos. Firma pública (#A-02):

```ts
export type Conversation = typeof conversation.$inferSelect;
export type Message = typeof message.$inferSelect;
export type MessageRole = Message["role"];

createConversation(userId: string, title?: string): Promise<Conversation>
getConversation(userId: string, id: string): Promise<Conversation | null>
listConversations(userId: string): Promise<Conversation[]>              // updatedAt desc
listMessages(userId: string, conversationId: string): Promise<Message[]> // createdAt asc
appendMessage(userId, conversationId, role, content): Promise<Message>   // bumps updatedAt
renameConversation(userId, id, title): Promise<Conversation | null>
deleteConversation(userId, id): Promise<boolean>
updateSystemPrompt(userId, id, prompt: string | null): Promise<Conversation | null>
```

**Invariantes:**
- `userId` siempre primero; toda consulta incluye `eq(conversation.userId, userId)`
- Para mensajes: `innerJoin` con `conversation` o verificación previa de ownership
- `appendMessage` actualiza `conversation.updatedAt` en la misma transacción
- Con `noUncheckedIndexedAccess`, `rows[0]` tras `.returning()` es `T | undefined`: comprobar y devolver `null` o lanzar
- Conversación ajena ⇒ `null` ⇒ 404 en la capa HTTP (no 403: no se filtra existencia)

---

## Integración con DeepSeek (`src/server/ai/deepseek.ts`)

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

`apiKey` y `baseURL` explícitos: si no, el SDK cae a `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` del entorno y la llamada se va al proveedor equivocado.

**Parámetros permitidos:** `model`, `max_tokens`, `system`, `messages`, `temperature` (0–2).
**Prohibidos:** `top_k`, `thinking`, `output_config`, `cache_control`, `betas`, `fallbacks`, `mcp_servers` → 400 inmediato.

Usar `Anthropic.MessageParam[]` para los mensajes; no definir un tipo paralelo.

---

## Rate limiting (`src/server/ai/rate-limit.ts`)

```ts
checkRateLimit(userId: string, now = Date.now()):
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }
```

- Almacén `Map<string, number[]>` (timestamps por usuario), cacheado en `globalThis` fuera de producción siguiendo el patrón de `src/server/db/index.ts` para sobrevivir a HMR
- Ventana de 60 000 ms; `retryAfterSeconds = Math.ceil((oldest + 60000 - now) / 1000)`
- Poda de timestamps fuera de ventana en cada llamada; limpieza perezosa de usuarios inactivos
- Configurable con `CHAT_RATE_LIMIT_PER_MINUTE` (default 20)
- `now` inyectable ⇒ función pura y testeable sin relojes falsos
- No se registra `userId` ni contenido en logs

**Limitación:** es por proceso. Con múltiples instancias o serverless deja de ser global — sustituir por Redis conservando la firma.

---

## Environment Variables

Declaradas en `src/env.js` (bloque `server` y `runtimeEnv`) y reflejadas en `.env.example`. **Nunca** usar `process.env` directamente; importar `{ env } from "~/env"`.

| Variable | Tipo | Default | Notas |
| -------- | ---- | ------- | ----- |
| `DATABASE_URL` | `z.string().url()` | — | Postgres local |
| `BETTER_AUTH_SECRET` | `z.string()` | opcional en dev | requerida en producción |
| `DEEPSEEK_API_KEY` | `z.string().min(1)` | — | secreto, nunca en logs |
| `DEEPSEEK_BASE_URL` | `z.string().url()` | `https://api.deepseek.com/anthropic` | |
| `DEEPSEEK_MODEL` | `z.string().min(1)` | `deepseek-flash` | cambiar de modelo sin tocar código |
| `CHAT_RATE_LIMIT_PER_MINUTE` | `z.coerce.number().int().positive()` | `20` | |
| `NODE_ENV` | enum | `development` | |

`emptyStringAsUndefined: true` hace que `DEEPSEEK_BASE_URL=""` caiga al default.
**Ojo:** `drizzle.config.ts` importa `~/env`, así que `bun run db:push` también exigirá `DEEPSEEK_API_KEY` (o `SKIP_ENV_VALIDATION=1`).

---

## Error Handling

| Situación | Respuesta |
| --------- | --------- |
| Sin sesión | 401 JSON, antes de tocar la DB o el LLM |
| Rate limit excedido | 429 JSON + `Retry-After` |
| Body inválido | 400 JSON con `issues` de zod |
| Conversación ajena o inexistente | 404 JSON |
| `Anthropic.APIError` antes del stream | 502 JSON, sin detalles del upstream |
| Fallo a mitad de stream | `controller.error(err)`; el texto parcial ya persistido se conserva |
| Server action sin sesión | `{ ok: false, error: "Unauthorized" }` |

Nunca se propaga el mensaje crudo del upstream al cliente (puede contener detalles de la cuenta o de la clave).

---

## Testing

- **Runner:** `bun test`, script `"test": "bun test"` en `package.json`
- **Preload:** `bunfig.toml` con `preload = ["./src/test/setup.ts"]`
- **Setup:** `src/test/setup.ts` fija `SKIP_ENV_VALIDATION=1`, `DEEPSEEK_API_KEY` dummy y `DATABASE_URL` **antes** de que cualquier módulo importe `~/env`
- **Cobertura objetivo (#C-03):** `chatRequestSchema` (límites y regla del último rol), `checkRateLimit` (inyectando `now`), route handler mockeando `~/server/ai/deepseek` y `~/server/better-auth/server`
- **Repositorio (#A-02):** tests contra el Postgres local

---

## Interconnections

### → Database
`src/server/chat/conversations.ts` es la única capa que toca Drizzle desde el dominio de chat. Ver [database.md](./database.md).

### → Authentication
`getSession()` de `src/server/better-auth/server.ts` en route handlers, páginas y server actions. Ver [authentication.md](./authentication.md).

### → DeepSeek
Cliente `deepseek` + lista blanca de parámetros. Ver [api.md](./api.md).

### → Frontend
Contrato HTTP y tipo `ChatMessage` exportado desde `chat-schema.ts`. Ver [frontend.md](./frontend.md).

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
| ------- | -------------- | -------- |
| 400 de DeepSeek al primer mensaje | parámetro no soportado o `max_tokens` por encima del tope | dejar solo `model`, `max_tokens`, `system`, `messages`, `temperature` |
| 404 del upstream | nombre de modelo inválido | cambiar `DEEPSEEK_MODEL` en `.env`, sin tocar código |
| `bun dev` falla al arrancar | falta una variable en `src/env.js` | completar `.env`; el mensaje de zod indica cuál |
| `db:push` pide `DEEPSEEK_API_KEY` | `drizzle.config.ts` importa `~/env` | definirla o `SKIP_ENV_VALIDATION=1 bun run db:push` |
| El stream no persiste la respuesta | `finalMessage()` no se está esperando | `await stream.finalMessage()` antes de `controller.close()` |
| Rate limit se resetea solo | HMR recrea el módulo | cachear el `Map` en `globalThis` fuera de producción |

---

**Maintained by:** @backend-architect
**Review cycle:** al cerrar Epic A y Epic C
