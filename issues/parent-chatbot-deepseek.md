---
id: "PARENT"
title: "[EPIC] Chatbot con DeepSeek (API compatible Anthropic)"
labels: ["epic", "feature", "chatbot"]
story_points: 56
assignee: "ronnycoding"
priority: "P0"
epic: null
dependencies: []
---

# [EPIC] Chatbot con DeepSeek (API compatible Anthropic)

## 📋 Summary
Construir un chatbot web autenticado sobre este T3 stack (Next.js 15 App Router, React 19, Better Auth, Drizzle/Postgres) que responde en streaming usando **DeepSeek a través de su endpoint compatible con la API de Anthropic** (`@anthropic-ai/sdk` con `baseURL: https://api.deepseek.com/anthropic`, modelo `deepseek-flash`). El trabajo se divide en tres slices que sirven como demo de las tres metodologías del workshop: Issue-Driven, BDD y Epic-Driven.

## 🎯 Problem Statement
El repo es un `create-t3-app` recién generado: tiene sign in / sign up / sign out pero ningún dominio propio, ninguna dependencia LLM y ningún test. Necesitamos un producto pequeño pero real (chat con historial, sidebar, rate limit, tests) que:

- se pueda construir en vivo por agentes de Claude Code en sesiones de 5–7 minutos,
- ejercite backend (route handler streaming), base de datos (Drizzle), frontend (React 19 client component) y QA,
- muestre cómo cada metodología entra por una puerta distinta (feature técnica, comportamiento de usuario, tablero de prioridades).

## 💡 Proposed Solution
Un contrato congelado entre slices para que cada una se implemente sin refactorizar la anterior:

- **`POST /api/chat`** recibe `{ messages: {role:"user"|"assistant", content}[], conversationId?: uuid }` (zod en `src/server/ai/chat-schema.ts`) y responde `200 text/plain` streameado con los deltas `text_delta` de DeepSeek. Errores en JSON: 400 (validación), 401 (sin sesión), 404 (conversación ajena), 429 (rate limit), 502 (upstream).
- **Cliente DeepSeek** en `src/server/ai/deepseek.ts` con `@anthropic-ai/sdk`; solo se envían `model`, `max_tokens`, `system`, `messages`, `temperature` (DeepSeek no soporta `top_k`, `thinking`, `output_config`, `cache_control`, `betas`, `fallbacks`).
- **Auth** reutilizando `getSession()` de `src/server/better-auth/server.ts` en route handlers, páginas y server actions.
- **Persistencia** con tablas `conversation` y `message` creadas con el helper `createTable` existente (prefijo `pg-drizzle_`), más el fix del `tablesFilter` en `drizzle.config.ts`.
- **UI** en `src/app/chat` con `ChatPanel` (`"use client"`) que consume el stream con `fetch` + `getReader()`/`TextDecoder` y soporta Stop vía `AbortController`.

### Metodología por slice
| Slice | Issues | Metodología | Prompts |
| ----- | ------ | ----------- | ------- |
| S1 | #01-01 | Issue-Driven: `/issue` → `/task` → `/pr` → `/code-review` | `prompts/01-issue-driven.md` |
| S2 | #01-02 | BDD: `/user-story` → `/issue` → `/task` | `prompts/02-bdd.md` |
| S3 | #EPIC-A, #EPIC-B, #EPIC-C | Epic-Driven: `/work-on-opens` → `git worktree list` → `/merge-and-test` | `prompts/03-epic-driven.md` |

Planificación previa (`/architecture`, `/mvp-requirements`): `prompts/00-planificacion.md`.

## 🔧 Task Breakdown & Assignments

### Sub-Issues Overview
| Issue   | Title                                                              | Agent/Assignee       | Story Points | Priority | Dependencies     | Completed |
| ------- | ------------------------------------------------------------------ | -------------------- | ------------ | -------- | ---------------- | --------- |
| #01-01  | [API] Chat streaming con DeepSeek + env + cliente SDK              | @backend-architect   | 8            | P0       | None             | [ ]       |
| #01-02  | [UI] Página `/chat` con respuesta streameada (v0.2.0)              | @frontend-developer  | 8            | P0       | #01-01           | [ ]       |
| #EPIC-A | [Epic] Persistencia de conversaciones y mensajes                   | @backend-architect   | 16           | P0       | #01-01, #01-02   | [ ]       |
| #A-01   | [DB] Schema `conversation`/`message` + fix `tablesFilter`          | @database-optimizer  | 3            | P0       | #01-01           | [ ]       |
| #A-02   | [Backend] Repositorio de conversaciones user-scoped + `bun test`   | @backend-architect   | 5            | P0       | #A-01            | [ ]       |
| #A-03   | [API] `/api/chat` persiste mensajes y devuelve `X-Conversation-Id` | @backend-architect   | 5            | P0       | #A-02            | [ ]       |
| #A-04   | [UI] Página `/chat/[conversationId]` con historial                 | @frontend-developer  | 3            | P0       | #A-02, #01-02    | [ ]       |
| #EPIC-B | [Epic] Sidebar de conversaciones con rename y delete               | @frontend-developer  | 11           | P1       | #EPIC-A          | [ ]       |
| #B-01   | [Backend] Server actions rename/delete                             | @backend-architect   | 3            | P1       | #A-02            | [ ]       |
| #B-02   | [UI] `chat/layout.tsx` + sidebar server-rendered                   | @frontend-developer  | 5            | P1       | #A-02, #A-04     | [ ]       |
| #B-03   | [UI] Item de conversación con rename inline y delete               | @frontend-developer  | 3            | P1       | #B-01, #B-02     | [ ]       |
| #EPIC-C | [Epic] Settings, rate limit y cobertura de tests                   | @test-automator      | 13           | P2       | #EPIC-A          | [ ]       |
| #C-01   | [Security] Rate limit por usuario (429 + `Retry-After`)            | @security-auditor    | 3            | P2       | #01-01           | [ ]       |
| #C-02   | [AI] System prompt por conversación                                | @ai-engineer         | 5            | P2       | #A-03, #A-04     | [ ]       |
| #C-03   | [Testing] Tests de schema, rate limit y route handler              | @test-automator      | 5            | P2       | #C-01, #C-02     | [ ]       |

> **📝 Status Update Instructions:**
> When a sub-issue is completed, edit this issue description and check the corresponding box `[x]` in the "Completed" column above.
> **DO NOT** post status updates in comments. Keep all progress tracking in this single table for a single source of truth.

**Total Story Points**: 56 (S1 8 + S2 8 + Epic A 16 + Epic B 11 + Epic C 13). Las filas de epics no suman: agrupan a sus sub-issues.

### Agent Assignments & Specializations
| Agent               | Specialization                    | Assigned Tasks                 | Total Points | Skills/Tooling                     |
| ------------------- | --------------------------------- | ------------------------------ | ------------ | ---------------------------------- |
| @backend-architect  | Route handlers, contratos, repos  | #01-01, #A-02, #A-03, #B-01    | 21           | `claude-api`                       |
| @frontend-developer | React 19, App Router, streaming   | #01-02, #A-04, #B-02, #B-03    | 19           | `component-reuse-first`            |
| @database-optimizer | Drizzle, índices, migraciones     | #A-01                          | 3            | -                                  |
| @security-auditor   | Rate limit, revisión de secretos  | #C-01 (+ revisión de #01-01)   | 3            | -                                  |
| @ai-engineer        | Prompts, integración LLM          | #C-02 (+ apoyo en #01-01)      | 5            | `claude-api`                       |
| @test-automator     | `bun test`, mocks, cobertura      | #C-03                          | 5            | -                                  |
| @code-reviewer      | Revisión de cada PR               | Todos (fase de review)         | -            | `/code-review`                     |

### Claude Code Skills & Tooling
**Existing Skills to Use:**
- `claude-api` — referencia del SDK `@anthropic-ai/sdk` (cliente, `messages.stream`, `finalMessage`, tipos `Anthropic.MessageParam`, errores tipados). Usar en #01-01, #A-03, #C-02.
- `component-reuse-first` — buscar componentes existentes antes de crear nuevos y diseñar `MessageBubble`/`ChatPanel` reutilizables. Usar en #01-02, #A-04, #B-02, #B-03.
- `/code-review` — revisión especializada de cada PR (correctness + seguridad).

**Recommended New Skills:**
- `deepseek-anthropic-compat` — skill de dominio que documente el endpoint `https://api.deepseek.com/anthropic`: modelos (`deepseek-flash`, `deepseek-v4-pro`, mapeo automático de nombres `claude-*`), parámetros soportados (`max_tokens`, `stop_sequences`, `stream`, `system`, `temperature` 0–2, `tool_use`), parcialmente soportados (`thinking` sin `budget_tokens`, `top_p` solo en thinking, `metadata.user_id`) y no soportados (`top_k`, `mcp_servers`, `document`/`search_result`/`code_execution`). Evita 400 por parámetros desconocidos y sirve de checklist para revisores. Crear con `create-skill`.

### Dependency Graph
```mermaid
graph TD
    S1[#01-01 API /api/chat] --> S2[#01-02 UI /chat]
    S1 --> A1[#A-01 Schema]
    A1 --> A2[#A-02 Repositorio]
    A2 --> A3[#A-03 Persistencia en /api/chat]
    A2 --> A4[#A-04 /chat/[id]]
    S2 --> A4
    A2 --> B1[#B-01 Server actions]
    A2 --> B2[#B-02 Layout + sidebar]
    A4 --> B2
    B1 --> B3[#B-03 Item rename/delete]
    B2 --> B3
    S1 --> C1[#C-01 Rate limit]
    A3 --> C2[#C-02 System prompt]
    A4 --> C2
    C1 --> C3[#C-03 Tests]
    C2 --> C3
```

### Integration Points
- **#01-01 (@backend-architect) → #01-02 (@frontend-developer)**: contrato `POST /api/chat` congelado — body `{ messages, conversationId? }`, respuesta `200 text/plain` streameado con headers `Cache-Control: no-cache, no-transform` y `X-Accel-Buffering: no`; errores JSON 400/401/502. `chat-schema.ts` exporta `chatRequestSchema` y el tipo `ChatMessage` sin importar código de servidor.
- **#A-01 (@database-optimizer) → #A-02 (@backend-architect)**: tablas `conversation` y `message` con `systemPrompt` nullable ya creado (evita segunda migración en #C-02).
- **#A-02 (@backend-architect) → #A-03, #A-04, #B-01, #B-02**: API del repositorio, todas las funciones reciben `userId` primero y filtran por él: `createConversation`, `getConversation`, `listConversations`, `listMessages`, `appendMessage`, `renameConversation`, `deleteConversation`, `updateSystemPrompt`.
- **#A-03 (@backend-architect) → #A-04 (@frontend-developer)**: header `X-Conversation-Id` en la respuesta; el cliente hace `router.replace(`/chat/${id}`)` si la página no tenía id. Aplica `conversation.systemPrompt ?? DEFAULT_SYSTEM_PROMPT`.
- **#B-01 (@backend-architect) → #B-03 (@frontend-developer)**: server actions `renameConversationAction` / `deleteConversationAction` con `FormData` validado por zod y `revalidatePath("/chat", "layout")`.
- **#C-01 → #C-03, #C-02 → #C-03**: `rate-limit.ts` y `chat-settings.tsx` como unidades testeables; `/api/chat` mockeando `~/server/ai/deepseek` y `~/server/better-auth/server`.

## ✅ Acceptance Criteria

- [ ] Todos los sub-issues completados y mergeados en `main` en el orden de merge recomendado por `/work-on-opens`
- [ ] `bun run typecheck`, `bun run check` y `bun test` en verde
- [ ] Un usuario autenticado puede abrir `/chat`, enviar un mensaje y ver la respuesta de DeepSeek aparecer progresivamente
- [ ] Las conversaciones persisten, se listan en el sidebar y solo las ve su dueño
- [ ] Peticiones sin sesión reciben 401; exceso de peticiones recibe 429 con `Retry-After`
- [ ] `DEEPSEEK_API_KEY` nunca aparece en logs ni en el cliente
- [ ] `CLAUDE.md` documenta `src/server/ai/` y el `tablesFilter` corregido
- [ ] Cada PR pasó por `/code-review` sin hallazgos críticos abiertos

## 📎 Additional Context

### Related Issues
- #01-01 – slice Issue-Driven
- #01-02 – slice BDD
- #EPIC-A, #EPIC-B, #EPIC-C – slice Epic-Driven

### References
- [DeepSeek — Anthropic API compatibility](https://api-docs.deepseek.com/guides/anthropic_api)
- [DeepSeek API docs](https://api-docs.deepseek.com/)
- `desarrollo-de-software-con-ia.pdf` — deck del workshop (flujos y demos por metodología)
- `~/.claude/README.md` — Development Methodologies (Issue-Driven, BDD, Epic-Driven)
- `prompts/README.md` — orden de ejecución de las demos

### Screenshots/Mockups
_N/A — la UI se define en #01-02 y #B-02._

## 🏷️ Labels
`epic`, `feature`, `chatbot`

## 📅 Timeline
- **Start**: 2026-09-19
- **Target Completion**: día del workshop (S1 y S2 pre-ejecutados; Epic A en vivo)
- **Estimated Duration**: 56 story points

## 👥 Team
- **Owner**: @ronnycoding
- **Contributors**: @backend-architect, @frontend-developer, @database-optimizer, @security-auditor, @ai-engineer, @test-automator
- **Reviewers**: @code-reviewer, @security-auditor
