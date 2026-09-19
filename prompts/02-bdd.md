# 02 · Behavior-Driven Development — del comportamiento al criterio

> Deck, pág. 22: `/user-story` → `/issue "Implement user authentication"` → `/task #124`. Qué mirar: cómo cada escenario Gherkin se convierte en un criterio de aceptación.

Feature elegida: **página `/chat` con respuesta streameada** (sub-issue de referencia: [`issues/sub-01-02-ui-chat-streaming.md`](../issues/sub-01-02-ui-chat-streaming.md)). Hay un usuario del otro lado y el comportamiento (streaming, Stop, errores) debe acordarse antes → encaja BDD.

Prerrequisito: el slice 1 (`POST /api/chat`) mergeado en `main`.

Tiempo: 5 min en vivo.

---

## Paso 1 · `/user-story` — spec BDD en Gherkin

```
/user-story
```

El comando pregunta por fases. Respuestas preparadas:

### Phase 0 · Formato

| Pregunta | Respuesta |
|---|---|
| How would you like to create the user story? | **GitHub Issue** |

### Phase 2 · Historia

| Pregunta | Respuesta |
|---|---|
| Nombre de la feature | `Chat con respuesta en streaming` |
| Persona | `usuario autenticado` |
| Objetivo | `enviar un mensaje en /chat y ver la respuesta del asistente aparecer palabra a palabra` |
| Beneficio | `obtener respuestas sin esperar a que termine la generación completa` |

```
As a usuario autenticado
I want enviar un mensaje en /chat y ver la respuesta del asistente aparecer palabra a palabra
So that obtengo respuestas sin esperar a que termine la generación completa
```

### Phase 2.5 · Versión

| Pregunta | Respuesta |
|---|---|
| ¿Versión? | `v0.2.0` |
| ¿Tipo de cambio? | **Feature** (minor: 0.1.0 → 0.2.0; `v0.1.0` fue la API del slice 1) |

### Phase 3 · Escenarios Gherkin

Pegar tal cual cuando pida cada escenario (o todos juntos si pregunta "¿más escenarios?"):

```gherkin
Feature: Chat con el asistente

  Scenario: Usuario autenticado recibe una respuesta streameada
    Given estoy autenticado
    And estoy en "/chat"
    When escribo "Hola" y pulso Enviar
    Then mi mensaje aparece en la conversación inmediatamente
    And la respuesta del asistente aparece progresivamente mientras llega el stream
    And el botón Enviar permanece deshabilitado hasta que termina el stream

  Scenario: Usuario anónimo es redirigido al login
    Given no estoy autenticado
    When abro "/chat"
    Then soy redirigido a "/" con el mensaje "Sign in to chat"

  Scenario: No se puede enviar un mensaje vacío
    Given estoy autenticado y en "/chat"
    When el campo está vacío o solo tiene espacios
    Then el botón Enviar está deshabilitado

  Scenario: Fallo del proveedor se muestra y es recuperable
    Given estoy autenticado y en "/chat"
    And la API de chat responde con estado 502
    When envío un mensaje
    Then veo "Algo salió mal, inténtalo de nuevo"
    And mi mensaje sigue en el campo para reintentar

  Scenario: El usuario detiene una respuesta larga
    Given el asistente está streameando una respuesta
    When pulso Detener
    Then el stream termina y la respuesta parcial se conserva
```

### Phase 4 · Contexto de negocio

| Pregunta | Respuesta |
|---|---|
| Problem statement | Hoy solo existe la API; sin UI nadie puede usar el chatbot |
| Priority | **High** |
| User segment | Todos los usuarios registrados |
| Expected usage | Varias veces por sesión |
| Business value | Primera versión usable del producto; base para persistencia y sidebar |

### Phase 5 · Contexto técnico

| Pregunta | Respuesta |
|---|---|
| Dependencies | `POST /api/chat` (v0.1.0) mergeado; `getSession()` de Better Auth |
| Integration points | `fetch("/api/chat")` same-origin con `getReader()` + `TextDecoder`; `AbortController` para Detener |
| Data requirements | Ninguna nueva (sin persistencia en esta versión). Props `ChatPanel { conversationId?, initialMessages? }` reservadas para v0.3.0 |
| UI/UX | `src/app/chat/page.tsx` (server, guard + redirect `/?error=Sign%20in%20to%20chat`), `_components/chat-panel.tsx` (`"use client"`), `_components/message-bubble.tsx`; enlace a `/chat` en `src/app/page.tsx` cuando hay sesión |
| Accessibility | textarea con label, `aria-live="polite"` en la burbuja del asistente, botón Detener con `type="button"` |

### Phase 6 · Testing

| Pregunta | Respuesta |
|---|---|
| Test coverage | E2E manual con Chrome MCP sobre los 5 escenarios; unit del reducer de mensajes si se extrae |
| Performance | Primer token visible < 2 s; sin bloqueo del hilo principal al renderizar deltas |
| Definition of Done extra | `bun run check` y `bun run typecheck` en verde; Biome: `useButtonType`, `noArrayIndexKey` (id por mensaje), `useExhaustiveDependencies` |

### Phase 7 · Metadata

| Pregunta | Respuesta |
|---|---|
| Story points | `8` |
| Epic | El epic "Chatbot con DeepSeek" si existe (si no, dejar vacío) |
| Sprint | Workshop |
| Labels | `user-story`, `bdd`, `frontend`, `v0.2.0` |
| Related stories | Sub-issue de la API (slice 1) |

### Phase 8 · Repositorio y proyecto

| Pregunta | Respuesta |
|---|---|
| Repository | `ronnycoding/desarrollo-de-software-con-ia` |
| GitHub Project | `https://github.com/users/ronnycoding/projects/8` |

### Qué mirar

- La issue resultante tiene los 5 escenarios en bloques ```gherkin``` y la etiqueta `v0.2.0`.
- Anota su número (`#S`) para el paso 2.

---

## Paso 2 · `/issue` — descomponer la historia

```
/issue Implementar la user story #S "Chat con respuesta en streaming" (v0.2.0). Mapear cada escenario Gherkin de #S a un criterio de aceptación verificable. Alcance: `src/app/chat/page.tsx` (server component con `getSession()` y `redirect("/?error=Sign%20in%20to%20chat")`), `src/app/chat/_components/chat-panel.tsx` ("use client": estado `messages`, `status: idle|streaming|error`, `AbortController` en ref, `fetch("/api/chat")` + `res.body.getReader()` + `TextDecoder` con `{stream:true}`, placeholder del asistente actualizado con updates funcionales, botón Detener que aborta y conserva el parcial, error si `!res.ok`), `src/app/chat/_components/message-bubble.tsx`, enlace a `/chat` en `src/app/page.tsx` junto a "Sign out", metadata en `layout.tsx`. Props de `ChatPanel`: `{ conversationId?: string; initialMessages?: ChatMessage[] }` (sin usar aún). Tipos desde `~/server/ai/chat-schema`. Sub-tareas: U1 page + guard + enlace (frontend-developer, 2), U2 message-bubble (frontend-developer, 1), U3 chat-panel streaming/stop/error (frontend-developer, 5); revisión de accesibilidad por code-reviewer. Skill: component-reuse-first. Total 8 story points.
```

| Pregunta | Respuesta |
|---|---|
| How would you like to create the issues? | **GitHub Issues** |

### Qué mirar

- En el sub-issue U3, cada criterio de aceptación cita el escenario Gherkin del que sale ("Scenario: El usuario detiene una respuesta larga" → "Detener aborta el fetch y conserva el texto parcial").

---

## Paso 3 · `/task` — implementar contra los escenarios

```
/task #U
```

(`U` = sub-issue `chat-panel` del paso 2.)

### Qué mirar

- El agente `frontend-developer` valida cada escenario antes de cerrar; el estado se refleja en la descripción del epic.
- Cierre: `/pr feat(chat): /chat page with streamed replies (v0.2.0). Closes #U` → `/code-review high`.

---

## Demo comprimida

```
/user-story            # respuestas de arriba
/issue <bloque paso 2>
/task #U
```
