# 01 · Issue-Driven Development — una feature, un PR

> Deck, pág. 16: `/issue "Add payment processing"` → `/task #101` → `/pr`. Qué mirar: los criterios de aceptación y el agente asignado en el sub-issue.

Feature elegida: **API de chat streaming con DeepSeek** (sub-issue de referencia: [`issues/sub-01-01-api-chat-deepseek.md`](../issues/sub-01-01-api-chat-deepseek.md)). Requisitos claros, sin comportamiento que negociar → encaja Issue-Driven.

Tiempo: 5 min en vivo (el `/task` completo tarda más; ver README para qué pre-ejecutar).

---

## Paso 1 · `/issue` — epic + sub-issues

Pegar en Claude Code (un solo bloque):

```
/issue Añadir una API de chat con streaming respaldada por DeepSeek usando su endpoint compatible con Anthropic.

Alcance:
- Instalar `@anthropic-ai/sdk` y crear `src/server/ai/deepseek.ts` con `new Anthropic({ apiKey: env.DEEPSEEK_API_KEY, baseURL: env.DEEPSEEK_BASE_URL })`. Exportar el cliente, `DEEPSEEK_MODEL = env.DEEPSEEK_MODEL` y `DEFAULT_MAX_TOKENS = 4096`.
- Añadir a `src/env.js` (bloque `server` y `runtimeEnv`) y a `.env.example`: `DEEPSEEK_API_KEY` (requerida), `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com/anthropic`), `DEEPSEEK_MODEL` (default `deepseek-flash`).
- `src/server/ai/prompts.ts` con `DEFAULT_SYSTEM_PROMPT`.
- `src/server/ai/chat-schema.ts` (solo importa zod): `chatRequestSchema` = `{ messages: {role:"user"|"assistant", content: string(1..8000)}[] (1..50, el último debe ser user), conversationId?: uuid }` y tipos `ChatMessage`, `ChatRequest`.
- `src/app/api/chat/route.ts` `POST`: 1) `getSession()` de `~/server/better-auth/server` antes de crear el stream, 401 JSON si no hay sesión; 2) `safeParse` del body, 400 JSON con issues; 3) `deepseek.messages.stream({ model, max_tokens, system, messages }, { signal: req.signal })`; 4) devolver `Response` con `ReadableStream<Uint8Array>` que encola cada `content_block_delta`/`text_delta`, `stream.abort()` en `cancel()`; headers `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; 5) `Anthropic.APIError` antes de empezar el stream → 502 JSON.
- Solo enviar a DeepSeek `model`, `max_tokens`, `system`, `messages`, `temperature`. Nunca `top_k`, `thinking`, `output_config`, `cache_control`, `betas`, `fallbacks` (DeepSeek responde 400).
- Usar tipos del SDK (`Anthropic.MessageParam`), no redefinir interfaces. Node runtime, no edge.
- Actualizar CLAUDE.md con una sección "AI (`src/server/ai/`)".

Criterios de aceptación:
- `bun run typecheck` y `bun run check` en verde.
- `curl -N -X POST localhost:3000/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"hola"}]}'` → 401 JSON.
- Misma petición con cookie `better-auth.session_token` → texto streameado progresivamente.
- Body inválido (messages vacío o último rol assistant) → 400 con issues de zod.
- Sin `DEEPSEEK_API_KEY`, `bun dev` falla en validación de env con mensaje claro.

Agentes sugeridos: backend-architect (route + schema), ai-engineer (cliente + env), code-reviewer y security-auditor en revisión (la key nunca se loguea; 401 antes de cualquier llamada upstream). Skill: claude-api. Story points: 8 (T1 env+cliente 2, T2 schema 1, T3 route 5).
```

### Respuestas preparadas

| Pregunta | Respuesta |
|---|---|
| How would you like to create the issues? | **GitHub Issues** |

### Qué mirar

- El epic padre tiene la tabla con columna **Completed** y la nota "DO NOT post status updates in comments".
- Cada sub-issue trae **Story Points** Fibonacci, **Assigned Agent** y **Blocked by**.
- Anota el número del sub-issue de la route (`#N`) para el paso 2.

---

## Paso 2 · `/task` — orquestación de agentes

```
/task #N
```

(reemplazar `N` por el sub-issue "API de chat streaming" creado en el paso 1; si el epic solo tiene un sub-issue, usar ese).

### Respuestas preparadas

| Pregunta | Respuesta |
|---|---|
| ¿Crear issue primero? (solo si pasas texto libre) | No aplica: pasamos número |
| ¿Proceder con el plan de tiers? | **Sí** |

### Qué mirar

- Tier 0 lanza `ai-engineer` y `backend-architect` **en paralelo** (una sola llamada con varios Task).
- El estado se actualiza editando la descripción del issue padre, nunca en comentarios.
- Al final corre `bun run check:write && bun run typecheck`.

---

## Paso 3 · `/pr` — pull request con convenciones

```
/pr feat(chat): streaming chat API backed by DeepSeek via Anthropic-compatible endpoint. Closes #N
```

### Qué mirar

- Detecta que no hay `.github/PULL_REQUEST_TEMPLATE.md` y usa `~/.claude/templates/GH_PR_TEMPLATE.md`.
- Tipo `feature`, impacto `High` (nueva dependencia externa + env requerida).
- Sección de testing con los `curl` de los criterios de aceptación.

---

## Paso 4 · `/code-review` — revisión especializada

```
/code-review high
```

(o `/code-review <número-de-PR> high`).

### Qué mirar

- Hallazgos sobre: `getSession()` fuera del `start()` del stream, `stream.abort()` en `cancel()`, sin `top_k`, key no expuesta en logs, `req.signal` propagado.
- Si aparecen findings, `/code-review --fix` los aplica en el working tree.

---

## Demo comprimida (si solo hay 5 min)

```
/issue <bloque del paso 1>
/task #N
/pr feat(chat): streaming chat API backed by DeepSeek. Closes #N
/code-review high
```
