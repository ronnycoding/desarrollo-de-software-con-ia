# MVP Requirements: Chatbot DeepSeek

**Date:** 2026-09-19
**Status:** Draft
**Target Timeline:** 4 fases (una por slice del workshop) · 56 story points
**Technical Basis:** `tech-stack/` + `tech-stack/diagrams/*.mmd` (sin NotebookLM)
**Versions:** v0.1.0 API · v0.2.0 UI · v0.3.0 persistencia + sidebar · v0.4.0 settings + tests

---

## 1. Executive Summary

### Problem Statement

El repositorio es un `create-t3-app` recién generado: tiene sign in / sign up / sign out y nada más. Ningún dominio propio, ninguna dependencia LLM, ningún test. Hace falta un producto pequeño pero real que ejercite backend, base de datos, frontend y QA, y que pueda construirse en vivo por agentes de Claude Code en sesiones de 5–7 minutos.

### Solution Overview

Chatbot web autenticado que responde en streaming usando **DeepSeek a través de su endpoint compatible con la API de Anthropic** (`@anthropic-ai/sdk` con `baseURL: https://api.deepseek.com/anthropic`, modelo `deepseek-flash`). Sobre la base existente: Next.js 15 App Router, React 19, Better Auth, Drizzle/Postgres, Bun, Biome.

El alcance se divide en tres slices que además sirven de demo de las tres metodologías del workshop (Issue-Driven, BDD, Epic-Driven).

### Target Users

Usuarios registrados con email y contraseña. No hay roles, ni administradores, ni acceso anónimo: todo el dominio de chat exige sesión.

### Success Criteria

1. **Primer token visible en < 2 s** con `deepseek-flash` desde que el usuario pulsa Send.
2. **0 errores de tipo y de lint**: `bun run typecheck` y `bun run check` en verde; `bun test` en verde desde Epic A.
3. **Demo reproducible**: un asistente del workshop clona, configura `.env`, levanta Postgres y tiene chat funcionando en menos de 5 minutos.

---

## 2. Technical Foundation

### Documentation Sources

Este MVP no usa NotebookLM. Las capacidades y restricciones se derivan de fuentes ya verificadas en el repositorio:

| Tipo | Fuente | Qué aporta |
| ---- | ------ | ---------- |
| [ARCH] | `tech-stack/README.md` | dominios, interconexiones, decisiones y trade-offs |
| [ARCH] | `tech-stack/diagrams/system-overview.mmd` | componentes y quién habla con quién |
| [FLOW] | `tech-stack/diagrams/data-flow.mmd` | secuencia completa de una petición de chat, incluidos todos los caminos de error |
| [INFRA] | `tech-stack/diagrams/deployment.mmd` | topología local del workshop |
| [API] | `tech-stack/api.md` | contrato de `POST /api/chat` + matriz de parámetros soportados por DeepSeek |
| [SPEC] | `issues/parent-chatbot-deepseek.md` + 13 sub-issues | contratos congelados entre slices y desglose en story points |
| [API] | https://api-docs.deepseek.com/guides/anthropic_api | compatibilidad Anthropic del endpoint de DeepSeek |
| [CODE] | `src/env.js`, `src/server/db/schema.ts`, `src/server/better-auth/*` | estado real del código base |

### Technology Stack

- **Plataforma:** Next.js ^15.2.3 (App Router) sobre **Node runtime** — no edge
- **UI:** React ^19, Tailwind CSS ^4.0.15
- **Lenguaje:** TypeScript ^5.8.2 estricto (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- **Auth:** Better Auth ^1.3, email/password, cookies same-origin
- **Datos:** PostgreSQL 17-alpine + Drizzle ORM ^0.41 + `postgres` ^3.4.4
- **LLM:** `@anthropic-ai/sdk` ^0.127 → DeepSeek, modelo `deepseek-flash`
- **Validación:** zod ^3.24
- **Tooling:** Bun (paquetes y tests), Biome ^2.2.5, drizzle-kit ^0.30
- **Despliegue:** solo local (`bun dev` + `docker compose`). Sin CI/CD, sin cloud

### Technical Constraints

1. **Solo parámetros soportados por DeepSeek**: `model`, `max_tokens`, `system`, `messages`, `temperature`. Cualquier campo desconocido devuelve 400 inmediato, sin degradación.
2. **Node runtime obligatorio**: `postgres.js` y Better Auth no funcionan en edge.
3. **Las server actions no pueden streamear**: el chat necesita un Route Handler; el CRUD usa actions.
4. **Biome estricto**: tabs, `import type`, imports organizados, atributos JSX y clases Tailwind ordenadas.
5. **`drizzle.config.ts` importa `~/env`**: todo comando `db:*` valida el entorno completo, incluida `DEEPSEEK_API_KEY`.
6. **Rate limit en memoria**: por proceso, no distribuido. Suficiente en local, inválido con múltiples instancias.
7. **Postgres compartido entre worktrees** en la demo Epic-Driven: el schema debe mergearse antes de paralelizar.

---

## 3. Available Capabilities

### Core Features (ya en el código base)

| Capability | Description | Availability | Complexity |
| ---------- | ----------- | ------------ | ---------- |
| Sign up / sign in / sign out | Better Auth email/password con server actions inline en `/` | ✅ Disponible | — |
| Sesión en servidor | `getSession()` cacheado con `React.cache` | ✅ Disponible | — |
| Conexión a Postgres | `postgres.js` cacheada en `globalThis`, sobrevive a HMR | ✅ Disponible | — |
| Helper de tablas | `createTable` con prefijo `pg-drizzle_` | ✅ Disponible | — |
| Validación de entorno | `src/env.js` con zod, fallo rápido al arrancar | ✅ Disponible | — |
| Streaming de chat | — | ❌ A construir (#01-01) | Moderada |
| Persistencia de conversaciones | — | ❌ A construir (Epic A) | Moderada |
| Sidebar con rename/delete | — | ❌ A construir (Epic B) | Simple |
| System prompt por conversación | — | ❌ A construir (#C-02) | Simple |
| Rate limit | — | ❌ A construir (#C-01) | Simple |
| Tests automatizados | — | ❌ A construir (#C-03) | Simple |

### API Capabilities (a construir)

| Endpoint | Method | Description | Auth | Rate Limit |
| -------- | ------ | ----------- | ---- | ---------- |
| `/api/chat` | POST | chat con respuesta `text/plain` streameada | sesión Better Auth | `CHAT_RATE_LIMIT_PER_MINUTE` (default 20/min por usuario) |
| `/api/auth/[...all]` | GET/POST | handler catch-all de Better Auth | — | — |

Todo el CRUD (rename, delete, system prompt) son **server actions**, no endpoints HTTP.

### Capacidades del proveedor (DeepSeek, endpoint Anthropic-compatible)

| Parámetro | Estado | Uso en el MVP |
| --------- | ------ | ------------- |
| `model` | ✅ soportado | `deepseek-flash` vía `DEEPSEEK_MODEL` |
| `max_tokens` | ✅ soportado | 4096 |
| `system` | ✅ soportado | string plano; nunca bloques con `cache_control` |
| `messages` | ✅ soportado | `Anthropic.MessageParam[]` |
| `temperature` | ✅ soportado (0–2) | opcional |
| `stream` | ✅ soportado | vía `messages.stream()` |
| `stop_sequences` | ✅ soportado | no se usa |
| `tool_use` | ✅ soportado | **fuera de alcance** |
| `metadata.user_id` | ⚠️ parcial | no se envía |
| `thinking` | ⚠️ parcial (sin `budget_tokens`) | **no usar** |
| `top_p` | ⚠️ parcial (solo con thinking) | **no usar** |
| `top_k` | ❌ no soportado | prohibido |
| `output_config` | ❌ no soportado | prohibido |
| `cache_control` | ❌ no soportado | prohibido |
| `betas` | ❌ no soportado | prohibido |
| `fallbacks` | ❌ no soportado | prohibido |
| `mcp_servers` | ❌ no soportado | prohibido |
| `document` / `search_result` / `code_execution` | ❌ no soportado | prohibido |

### Integration Points

- **Autenticación:** Better Auth email/password. Sin OAuth, sin SSO, sin MFA.
- **Terceros:** únicamente DeepSeek. Sin pagos, sin email, sin analytics, sin almacenamiento de objetos.
- **Webhooks:** ninguno.

### Limitations

| Límite | Valor | Origen |
| ------ | ----- | ------ |
| Mensajes por petición | 1–50 | `chatRequestSchema` (zod) |
| Tamaño de cada mensaje | 1–8000 caracteres | `chatRequestSchema` |
| Último mensaje | debe tener `role: "user"` | `chatRequestSchema` |
| Tokens de salida | 4096 por respuesta | `DEFAULT_MAX_TOKENS` |
| Peticiones por usuario | 20/min (configurable) | `CHAT_RATE_LIMIT_PER_MINUTE` |
| System prompt | 0–4000 caracteres | validación de la server action |
| Título de conversación | 1–120 caracteres | columna `varchar(120)` |
| Adjuntos | no soportados | fuera de alcance |
| Retención de datos | indefinida, sin purga | decisión del MVP |

---

## 4. MVP Scope Definition

### Matriz MUST / SHOULD / COULD

| Prioridad | Capacidad | Slice | Issues | SP | Versión |
| --------- | --------- | ----- | ------ | -- | ------- |
| **MUST** | Chat con respuesta streameada (API) | S1 · Issue-Driven | #01-01 | 8 | v0.1.0 |
| **MUST** | Autenticación obligatoria en todo el dominio de chat | S1 + S2 | #01-01, #01-02 | incluido | v0.1.0 |
| **MUST** | UI de chat que consume el stream | S2 · BDD | #01-02 | 8 | v0.2.0 |
| **SHOULD** | Persistencia de conversaciones y mensajes por usuario | S3 · Epic-Driven | Epic A (#A-01…#A-04) | 16 | v0.3.0 |
| **SHOULD** | Sidebar de conversaciones con rename y delete | S3 · Epic-Driven | Epic B (#B-01…#B-03) | 11 | v0.3.0 |
| **COULD** | System prompt por conversación | S3 · Epic-Driven | #C-02 | 5 | v0.4.0 |
| **COULD** | Rate limit por usuario | S3 · Epic-Driven | #C-01 | 3 | v0.4.0 |
| **COULD** | Cobertura de tests automatizados | S3 · Epic-Driven | #C-03 | 5 | v0.4.0 |

**Total: 56 story points.**

---

### MUST-HAVE Features (v1.0)

#### F1 · API de chat streaming con DeepSeek — `#01-01` · 8 SP

**User Story:** Como usuario autenticado, quiero enviar mis mensajes a un endpoint que responda progresivamente, para no esperar a que el modelo termine antes de ver algo.

**Acceptance Criteria:**
- [ ] `POST /api/chat` sin sesión devuelve `401 { "error": "Unauthorized" }` **antes** de cualquier llamada upstream
- [ ] Con sesión válida, la respuesta es `200 text/plain; charset=utf-8` y los chunks llegan progresivamente (`curl -N` los muestra uno a uno)
- [ ] Headers presentes: `Cache-Control: no-cache, no-transform` y `X-Accel-Buffering: no`
- [ ] Body inválido (array vacío, último `role: "assistant"`, `content` > 8000) devuelve `400` con `issues` de zod
- [ ] Un `Anthropic.APIError` antes del primer byte devuelve `502 { "error": "Upstream error" }`
- [ ] Sin `DEEPSEEK_API_KEY`, `bun dev` falla en la validación de entorno con mensaje claro
- [ ] `DEEPSEEK_API_KEY` no aparece en ningún `console.*` ni en la respuesta
- [ ] Solo se envían a DeepSeek `model`, `max_tokens`, `system`, `messages` (y `temperature` opcional)

**Technical Implementation:** `src/server/ai/{deepseek,prompts,chat-schema}.ts` + `src/app/api/chat/route.ts`. Guard de sesión → validación zod → `deepseek.messages.stream()` → `ReadableStream` que encola los `text_delta`. Ver `tech-stack/api.md` y `tech-stack/diagrams/data-flow.mmd`.

**Complexity:** Moderada · **Dependencies:** ninguna · **Blocks:** F2, Epic A, #C-01

---

#### F2 · Página `/chat` con respuesta streameada — `#01-02` · 8 SP

**User Story:** Como usuario autenticado, quiero escribir en una página de chat y ver la respuesta aparecer palabra a palabra, para percibir la conversación como fluida.

**Acceptance Criteria:**
- [ ] Un usuario anónimo que abre `/chat` es redirigido a `/?error=Sign%20in%20to%20chat`
- [ ] Con sesión, el usuario escribe, pulsa Send y ve el texto aparecer progresivamente
- [ ] El botón Stop cancela el stream (`AbortController`), conserva el texto parcial y devuelve el estado a `idle`
- [ ] Send está deshabilitado si el input está vacío o hay un stream en curso
- [ ] Un error del servidor muestra el mensaje y **conserva el texto del usuario** en el input para reintentar
- [ ] Accesibilidad: `<label>` en el textarea, `type="button"` en Stop, `aria-live="polite"` en la respuesta en curso, foco devuelto al textarea al terminar
- [ ] `ChatPanel` acepta ya `conversationId` e `initialMessages` (sin usarlos) para no refactorizar en #A-04

**Technical Implementation:** `src/app/chat/page.tsx` (server, guard) + `_components/chat-panel.tsx` (`"use client"`, `fetch` + `getReader()` + `TextDecoder`) + `_components/message-bubble.tsx`. Ver `tech-stack/frontend.md`.

**Complexity:** Moderada · **Dependencies:** F1 · **Blocks:** #A-04

---

### SHOULD-HAVE Features (v0.3.0)

#### F3 · Persistencia de conversaciones y mensajes — `Epic A` · 16 SP

**User Story:** Como usuario, quiero que mis conversaciones se guarden y pueda volver a ellas, para no perder el contexto al recargar.

**Sub-features:**

| Issue | Alcance | SP |
| ----- | ------- | -- |
| #A-01 | Tablas `conversation` y `message` con índices y relations; fix de `tablesFilter` | 3 |
| #A-02 | Repositorio user-scoped `src/server/chat/conversations.ts` + `bun test` | 5 |
| #A-03 | `/api/chat` persiste mensajes y devuelve `X-Conversation-Id` | 5 |
| #A-04 | Página `/chat/[conversationId]` con historial | 3 |

**Acceptance Criteria:**
- [ ] `bun run db:push` crea `pg-drizzle_conversation` y `pg-drizzle_message` contra el Postgres de `docker compose`
- [ ] Toda función del repositorio recibe `userId` como primer parámetro y filtra por él
- [ ] Una conversación de otro usuario devuelve `404`, no `403` (no se revela que el id existe)
- [ ] La primera respuesta incluye el header `X-Conversation-Id` y el cliente hace `router.replace("/chat/<id>")`
- [ ] El mensaje del usuario se persiste antes de abrir el stream; el del asistente tras `finalMessage()`
- [ ] Si el usuario cancela a mitad, el texto parcial se persiste igualmente
- [ ] Recargar `/chat/[conversationId]` muestra el historial completo en orden

**Complexity:** Moderada · **Dependencies:** F1, F2 · **Blocks:** Epic B, Epic C

---

#### F4 · Sidebar de conversaciones con rename y delete — `Epic B` · 11 SP

**User Story:** Como usuario con varias conversaciones, quiero verlas listadas y poder renombrarlas o borrarlas, para organizar mi historial.

**Sub-features:**

| Issue | Alcance | SP |
| ----- | ------- | -- |
| #B-01 | Server actions `renameConversationAction` / `deleteConversationAction` | 3 |
| #B-02 | `chat/layout.tsx` + sidebar server-rendered | 5 |
| #B-03 | Item de conversación con rename inline y delete | 3 |

**Acceptance Criteria:**
- [ ] El sidebar lista las conversaciones del usuario ordenadas por `updatedAt` descendente
- [ ] Renombrar actualiza el título sin recargar la página (`revalidatePath("/chat", "layout")`)
- [ ] Borrar elimina la conversación y sus mensajes en cascada
- [ ] Las actions validan `FormData` con zod y exigen sesión
- [ ] Un usuario no puede renombrar ni borrar una conversación ajena

**Complexity:** Simple · **Dependencies:** F3

---

### COULD-HAVE Features (v0.4.0)

#### F5 · System prompt por conversación — `#C-02` · 5 SP

**User Story:** Como usuario, quiero ajustar las instrucciones del asistente en una conversación concreta, para adaptar su tono o su rol sin afectar al resto.

**Acceptance Criteria:**
- [ ] Panel `<details>` "System prompt" en `/chat/[conversationId]` con textarea, Guardar y Restablecer
- [ ] Guardar persiste en `conversation.systemPrompt`; vaciar el campo lo pone a `null` y vuelve a `DEFAULT_SYSTEM_PROMPT`
- [ ] La siguiente petición a `/api/chat` usa `conversation.systemPrompt ?? DEFAULT_SYSTEM_PROMPT`
- [ ] Límite de 4000 caracteres, validado en la action
- [ ] No requiere migración: la columna `systemPrompt` ya se crea en #A-01

**Complexity:** Simple · **Dependencies:** F3

---

#### F6 · Rate limit por usuario — `#C-01` · 3 SP

**User Story:** Como responsable del despliegue, quiero limitar las peticiones por usuario, para acotar el coste en tokens y evitar abuso.

**Acceptance Criteria:**
- [ ] `checkRateLimit(userId, now?)` devuelve `{ allowed: true }` o `{ allowed: false, retryAfterSeconds }`
- [ ] Se invoca **inmediatamente después** del guard de sesión y antes de validar el body
- [ ] Al superar el límite: `429 { "error": "Rate limited" }` con header `Retry-After`
- [ ] Ventana de 60 s, límite configurable con `CHAT_RATE_LIMIT_PER_MINUTE` (default 20)
- [ ] El almacén sobrevive a HMR (cacheado en `globalThis` fuera de producción)
- [ ] No se registra `userId` ni contenido en logs

**Complexity:** Simple · **Dependencies:** F1

---

#### F7 · Cobertura de tests — `#C-03` · 5 SP

**User Story:** Como desarrollador, quiero tests que protejan el contrato, para refactorizar sin romper la demo.

**Acceptance Criteria:**
- [ ] `bun test` en verde; script `"test": "bun test"` en `package.json`
- [ ] `bunfig.toml` con `preload = ["./src/test/setup.ts"]`; el setup fija `SKIP_ENV_VALIDATION=1` y valores dummy antes de que nadie importe `~/env`
- [ ] Tests de `chatRequestSchema`: acepta 1..50 mensajes, rechaza array vacío, rechaza último `role: "assistant"`, rechaza `content` > 8000
- [ ] Tests de `checkRateLimit` inyectando `now` (sin relojes falsos)
- [ ] Tests del route handler mockeando `~/server/ai/deepseek` y `~/server/better-auth/server`: 401, 400, 429 y camino feliz

**Complexity:** Simple · **Dependencies:** F5, F6

---

### OUT OF SCOPE

| Excluido | Rationale |
| -------- | --------- |
| Tool use / function calling | DeepSeek lo soporta, pero multiplica la complejidad del route handler y del cliente. Sin caso de uso en la demo |
| Adjuntos y multimodal | `document`, `search_result` y `code_execution` no están soportados por el endpoint compatible |
| Multi-modelo / selector de modelo | el modelo se cambia con una variable de entorno; un selector exigiría persistirlo y validarlo por conversación |
| Compartir conversaciones | requiere un modelo de permisos que rompe la invariante "toda consulta filtra por `userId`" |
| Facturación y cuotas de pago | sin producto comercial |
| OAuth, SSO, MFA, verificación de email, reset de contraseña | Better Auth los soporta; fuera del camino crítico de la demo |
| Búsqueda de conversaciones | sin motor de búsqueda; el sidebar ordena por fecha |
| Renderizado de markdown en las respuestas | añade riesgo de XSS y una dependencia; el MVP renderiza texto plano |
| Rate limit distribuido (Redis) | el almacén en memoria basta en local; documentado como limitación |
| CI/CD, staging, producción | despliegue fuera de alcance; la puerta de calidad es local |
| Observabilidad (APM, tracing, alerting) | solo logs a stdout y `usage.output_tokens` |

---

## 5. User Workflows

### Primary Workflow: enviar un mensaje y recibir respuesta en streaming

**User Journey:**
1. **Entry:** el usuario inicia sesión en `/` (email + contraseña) y pulsa el link a `/chat`.
2. **Paso 1:** escribe su mensaje en el textarea y pulsa Send. La UI añade su mensaje y un placeholder vacío del asistente.
3. **Paso 2:** el texto de la respuesta aparece progresivamente, palabra a palabra.
4. **Paso 3 (opcional):** pulsa Stop; el stream se corta y el texto parcial se conserva.
5. **Outcome:** la conversación queda visible; desde v0.3.0, persistida y accesible desde el sidebar.

**Technical Flow** (detalle completo en `tech-stack/diagrams/data-flow.mmd`):
```
Send → ChatPanel → POST /api/chat
     → getSession() → checkRateLimit() → zod → ownership/creación
     → appendMessage(user) → deepseek.messages.stream()
     → text_delta → chunk HTTP → getReader() → setMessages
     → finalMessage() → appendMessage(assistant) → close()
```

**Success Criteria:**
- Primer token en pantalla en **< 2 s**
- Sin errores en el camino feliz
- Edge cases cubiertos: sin sesión (401 → redirect), rate limit (429 + `Retry-After`), body inválido (400), conversación ajena (404), upstream caído (502), cancelación del usuario (texto parcial persistido)

---

### Secondary Workflow: retomar una conversación (v0.3.0)

1. **Entry:** el usuario abre `/chat` y ve el sidebar con sus conversaciones ordenadas por actividad.
2. **Paso 1:** pulsa una conversación → `/chat/[conversationId]`.
3. **Paso 2:** la página carga el historial en servidor (`listMessages`) y lo pasa como `initialMessages`.
4. **Paso 3:** escribe un mensaje nuevo; la petición incluye `conversationId` y los mensajes se añaden a la misma conversación.
5. **Outcome:** el historial crece y `updatedAt` sube la conversación al principio del sidebar.

**Success Criteria:** el historial se renderiza en servidor (sin flash de contenido vacío); una conversación ajena devuelve 404.

---

### Tertiary Workflow: organizar el historial (v0.3.0)

1. El usuario pulsa el menú de un item del sidebar.
2. **Rename:** edición inline → server action → `revalidatePath("/chat", "layout")` → el título se actualiza sin recargar.
3. **Delete:** server action → la conversación y sus mensajes desaparecen en cascada.
4. **Outcome:** sidebar consistente con el estado de la base.

---

### Quaternary Workflow: ajustar el system prompt (v0.4.0)

1. En `/chat/[conversationId]`, el usuario abre el panel `<details>` "System prompt".
2. Escribe instrucciones (0–4000 caracteres) y pulsa Guardar.
3. La siguiente respuesta del asistente ya usa ese prompt; Restablecer vuelve al `DEFAULT_SYSTEM_PROMPT`.

---

## 6. Data Requirements

### Data Models

#### `conversation` (tabla `pg-drizzle_conversation`)
- `id` — uuid, PK, `defaultRandom()`
- `userId` — text, NOT NULL, FK → `user.id` `onDelete: cascade`
- `title` — varchar(120), NOT NULL, default `"New conversation"` (primer mensaje recortado a 60 caracteres)
- `systemPrompt` — text, NULL (creada en #A-01 para evitar una segunda migración en #C-02)
- `createdAt` / `updatedAt` — timestamptz NOT NULL
- Índice: `conversation_user_updated_idx (userId, updatedAt)`

#### `message` (tabla `pg-drizzle_message`)
- `id` — uuid, PK, `defaultRandom()`
- `conversationId` — uuid, NOT NULL, FK → `conversation.id` `onDelete: cascade`
- `role` — text con enum `["user", "assistant"]`, NOT NULL
- `content` — text, NOT NULL
- `createdAt` — timestamptz NOT NULL
- Índice: `message_conversation_created_idx (conversationId, createdAt)`

#### Tablas de Better Auth (existentes)
`user`, `session`, `account`, `verification` — sin prefijo, nombres exactos que espera el adaptador.

**Storage:** PostgreSQL 17 · **Estimated Volume:** pequeño (< 1000 conversaciones, decenas de miles de mensajes en el peor caso del workshop).

### Data Operations

Todas en `src/server/chat/conversations.ts`, con `userId` como primer parámetro:

| Operación | Función |
| --------- | ------- |
| Create | `createConversation`, `appendMessage` |
| Read | `getConversation`, `listConversations`, `listMessages` |
| Update | `renameConversation`, `updateSystemPrompt` |
| Delete | `deleteConversation` (mensajes en cascada) |
| Search / Filter | no soportado en el MVP |

### Privacidad

El contenido de los chats se guarda **en claro**. Sin cifrado en reposo, sin purga automática, sin exportación. Limitación aceptada y documentada en `tech-stack/database.md`.

---

## 7. Integration Requirements

### Required Integrations

#### DeepSeek (endpoint compatible con Anthropic)
- **Purpose:** inferencia del modelo con streaming
- **Provider:** DeepSeek — https://api-docs.deepseek.com/guides/anthropic_api
- **Implementation:** `@anthropic-ai/sdk` ^0.127 con `apiKey` y `baseURL` explícitos (si no, el SDK cae a `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` y la petición acaba en otro proveedor)
- **Credenciales:** `DEEPSEEK_API_KEY` (https://platform.deepseek.com/api_keys)
- **Effort:** Moderado (incluido en #01-01)
- **Portabilidad:** cambiar de proveedor son dos variables de entorno, cero cambios de código

### Optional Integrations (Post-MVP)

Ninguna planificada. Email, pagos, analytics, almacenamiento de objetos y colas están fuera del alcance.

---

## 8. Non-Functional Requirements

### Performance
- **Tiempo al primer token:** < 2 s con `deepseek-flash`
- **Carga de página:** server components; el historial no viaja como JS
- **Concurrencia:** un proceso, decenas de usuarios del workshop
- **Uptime:** best-effort local, sin SLA

### Security
- **Authentication:** Better Auth email/password, cookie httpOnly same-origin
- **Authorization:** modelo *authenticated / owner*. Sin roles. Ownership por firma de función (`userId` primero)
- **Orden de guards:** sesión → rate limit → validación → ownership → stream. Una petición anónima nunca gasta tokens
- **Secretos:** solo en el bloque `server` de `src/env.js`; nunca `NEXT_PUBLIC_*`, nunca en logs
- **Input:** zod limita 50 mensajes × 8000 caracteres; las server actions validan `FormData`
- **XSS:** respuestas renderizadas como texto, sin `dangerouslySetInnerHTML`
- **Compliance:** ninguna (GDPR/HIPAA fuera de alcance; sin usuarios reales)

### Scalability
- **Target:** prototipo / workshop (< 100 usuarios)
- **Estrategia:** ninguna. Los límites conocidos y su salida están en `tech-stack/README.md` (rate limit → Redis, pool → PgBouncer, historial → ventana deslizante, sidebar → paginación)

---

## 9. Technical Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
| ---- | ------ | ----------- | ---------- |
| Parámetro no soportado hacia DeepSeek → 400 inmediato | Alto (demo rota) | Media | Lista blanca en `tech-stack/api.md`; revisión obligatoria en `/code-review`; skill `deepseek-anthropic-compat` |
| `tablesFilter` actual no casa con ninguna tabla | Alto (bloquea Epic A) | Alta (ya presente) | Fix en #A-01 antes de tocar persistencia |
| Puerto de Postgres desalineado (`.env.example` 5464 vs compose 5434) | Alto (`ECONNREFUSED` al clonar) | Alta (ya presente) | Fijar `POSTGRES_PORT` y alinear `.env.example`, `CLAUDE.md` y `src/test/setup.ts` |
| Worktrees sin `.env` ni `node_modules` | Alto (demo 3 falla) | Alta | Copiar `.env` y `bun install` en cada worktree antes de lanzar agentes |
| Postgres compartido entre worktrees | Medio (conflictos de schema) | Media | Mergear Epic A antes de arrancar Epic B |
| Un proxy bufferea el stream y la respuesta llega de golpe | Medio | Baja en local | Headers `Cache-Control: no-cache, no-transform` y `X-Accel-Buffering: no`; verificar con `curl -vN` |
| Modelo `deepseek-flash` devuelve 404 | Medio | Baja | Cambiar `DEEPSEEK_MODEL` en `.env`, sin tocar código |
| Historial completo reenviado en cada petición | Medio (coste creciente) | Alta en conversaciones largas | Documentado; ventana deslizante como evolución |
| Rate limit en memoria no sobrevive a reinicios | Bajo | Alta | Aceptado; migrar a Redis si hay más de una instancia |
| `db:push` exige `DEEPSEEK_API_KEY` (drizzle importa `~/env`) | Bajo | Alta | Definirla o `SKIP_ENV_VALIDATION=1` |

---

## 10. Development Approach

### Fase 1 — S1 · API (v0.1.0) · Issue-Driven · 8 SP
- [ ] `bun add @anthropic-ai/sdk`; `DEEPSEEK_*` en `src/env.js` y `.env.example`
- [ ] `src/server/ai/{deepseek,prompts,chat-schema}.ts`
- [ ] `src/app/api/chat/route.ts` con guard de sesión y streaming
- [ ] Documentar `src/server/ai/` en `CLAUDE.md`
- [ ] Verificación manual con `curl -N` (401, 400, 200)
- **Comandos:** `/issue` → `/task` → `/pr` → `/code-review` (`prompts/01-issue-driven.md`)

### Fase 2 — S2 · UI (v0.2.0) · BDD · 8 SP
- [ ] `src/app/chat/page.tsx` con guard y metadata
- [ ] `_components/message-bubble.tsx` y `_components/chat-panel.tsx`
- [ ] Link a `/chat` desde `/`
- [ ] Revisión de accesibilidad
- **Comandos:** `/user-story` → `/issue` → `/task` (`prompts/02-bdd.md`)

### Fase 3 — Epics A y B · Persistencia y sidebar (v0.3.0) · 27 SP
- [ ] #A-01 schema + fix de `tablesFilter` → **mergear antes de paralelizar**
- [ ] #A-02 repositorio + `bun test` (tier 0 del resto)
- [ ] #A-03 y #A-04 en paralelo
- [ ] Epic B: #B-01 → #B-02 → #B-03
- **Comandos:** `/work-on-opens` → `git worktree list` → `/merge-and-test` (`prompts/03-epic-driven.md`)

### Fase 4 — Epic C · Settings, rate limit y tests (v0.4.0) · 13 SP
- [ ] #C-01 rate limit (independiente, puede ir en paralelo)
- [ ] #C-02 system prompt
- [ ] #C-03 tests de schema, rate limit y route handler
- [ ] Cierre: `bun run typecheck`, `bun run check`, `bun test` en verde

### Orden de merge
`#01-01` → `#01-02` → `#A-01` → `#A-02` → `#A-03`/`#A-04` → `#B-01` → `#B-02` → `#B-03` → `#C-01`/`#C-02` → `#C-03`

---

## 11. Future Roadmap (Post-MVP)

### v2.0 — candidatos
- Tool use / function calling (soportado por DeepSeek, fuera del MVP)
- Renderizado de markdown con sanitización
- Búsqueda y paginación de conversaciones
- Selector de modelo por conversación
- Exportar una conversación

### Visión a largo plazo
- Rate limit distribuido (Redis) y despliegue multi-instancia
- Ventana deslizante de historial + resumen persistido, para acotar el coste
- Observabilidad real: OpenTelemetry alrededor del route handler, Sentry en cliente
- Verificación de email y recuperación de contraseña

---

## 12. Documentation & Resources

### Arquitectura (base técnica de este documento)
- `tech-stack/README.md` — overview, interconexiones, decisiones
- `tech-stack/api.md` — contrato de `/api/chat` y matriz de parámetros DeepSeek
- `tech-stack/frontend.md`, `backend.md`, `database.md`, `authentication.md`, `infrastructure.md`, `monitoring.md`
- `tech-stack/diagrams/system-overview.mmd`, `data-flow.mmd`, `deployment.mmd`

### Especificación de trabajo
- `issues/parent-chatbot-deepseek.md` + 13 sub-issues
- `prompts/README.md` — orden de ejecución de las demos

### Externa
- [DeepSeek — Anthropic API compatibility](https://api-docs.deepseek.com/guides/anthropic_api)
- [Better Auth](https://www.better-auth.com/) · [Drizzle ORM](https://orm.drizzle.team/) · [Next.js App Router](https://nextjs.org/docs/app)

> **Nota:** no se usó NotebookLM. No existe `mvp-documentation.md`: la trazabilidad de capacidades apunta a `tech-stack/` y al código, ambos verificables en el repositorio.

---

## 13. Next Steps

1. **Revisión**
   - [ ] Validar la matriz MUST/SHOULD/COULD contra el tiempo real de la sesión (45 min)
   - [ ] Confirmar que `DEEPSEEK_API_KEY` funciona con `deepseek-flash`

2. **Higiene previa (bloqueante para Epic A)**
   - [ ] Alinear el puerto de Postgres en `.env.example`, `docker-compose.yml`, `CLAUDE.md` y `src/test/setup.ts`
   - [ ] Aplicar el fix de `tablesFilter` (#A-01)

3. **Preparación del workshop**
   - [ ] Pre-ejecutar S1 y S2 y mergear ambos PRs
   - [ ] `bash prompts/scripts/publish-epics.sh` para publicar Epics A/B/C en el board
   - [ ] `export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` y verificar `gh auth status`

4. **Ejecución**
   - [ ] Fase 1 con `/issue` → `/task` → `/pr` → `/code-review`

---

## Appendix A: Capability Inventory

**Ya disponible en el código base:** auth email/password con server actions, `getSession()` cacheado, conexión Postgres resistente a HMR, helper `createTable`, validación de entorno con zod, Tailwind v4, Biome, drizzle-kit (`push`/`generate`/`migrate`/`studio`).

**A construir (MUST):** cliente DeepSeek, `DEFAULT_SYSTEM_PROMPT`, `chatRequestSchema`, route handler streaming, `ChatPanel`, `MessageBubble`, página `/chat`.

**A construir (SHOULD):** tablas `conversation`/`message`, repositorio user-scoped, persistencia en el route handler, `X-Conversation-Id`, página `/chat/[conversationId]`, layout con sidebar, server actions de rename/delete, item de conversación.

**A construir (COULD):** `chat-settings.tsx`, `updateSystemPromptAction`, `rate-limit.ts`, `bunfig.toml` + `src/test/setup.ts` + suite de tests.

**Del proveedor:** streaming (`messages.stream`), `system` como string, `temperature`, `stop_sequences`, `tool_use` (sin usar), mapeo automático de nombres `claude-*`.

---

## Appendix B: Technical Constraints

| Categoría | Restricción |
| --------- | ----------- |
| Proveedor | Solo `model`, `max_tokens`, `system`, `messages`, `temperature`. Prohibidos: `top_k`, `thinking`, `output_config`, `cache_control`, `betas`, `fallbacks`, `mcp_servers`, `document`, `search_result`, `code_execution` |
| Proveedor | `max_tokens` 4096; por encima del tope del modelo → 400 |
| Runtime | Node obligatorio (no edge) por `postgres.js` y Better Auth |
| Framework | Las server actions no pueden streamear texto incremental |
| Entrada | 1–50 mensajes, 1–8000 caracteres cada uno, último con `role: "user"` |
| Entrada | System prompt 0–4000 caracteres; título 1–120 caracteres |
| Rate limit | 20 req/min por usuario (configurable), ventana de 60 s, almacén en memoria por proceso |
| Datos | Sin cifrado en reposo, sin purga, sin exportación, sin búsqueda |
| Auth | Solo email/password. Sin OAuth, SSO, MFA, verificación de email ni reset de contraseña |
| Entorno | Toda variable nueva va en `src/env.js` **y** en `.env.example`; importar `{ env } from "~/env"`, nunca `process.env` |
| Entorno | `drizzle.config.ts` importa `~/env`: los comandos `db:*` exigen el entorno completo |
| Estilo | Biome: tabs, `import type`, imports organizados, atributos JSX y clases Tailwind ordenadas |
| Tipos | TypeScript estricto con `noUncheckedIndexedAccess`: `rows[0]` es `T | undefined` |
| Despliegue | Solo local. Sin CI/CD, sin staging, sin producción |

---

**Document Version:** 1.0
**Last Updated:** 2026-09-19
**Owner:** @ronnycoding
