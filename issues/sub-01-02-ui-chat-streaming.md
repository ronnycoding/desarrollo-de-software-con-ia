---
id: "01-02"
title: "[Sub-issue] Página /chat con respuesta streameada (v0.2.0)"
labels: ["sub-issue", "frontend", "bdd", "v0.2.0", "story-points:8"]
story_points: 8
assignee: "frontend-developer"
priority: "P0"
epic: "PARENT"
dependencies: ["01-01"]
---

# [SUB-ISSUE] Página /chat con respuesta streameada (v0.2.0)

## 🔗 Parent Issue
Part of #PARENT - [EPIC] Chatbot con DeepSeek (API compatible Anthropic)

## 👤 Assignment
**Assigned Agent/Team Member**: @frontend-developer
**Specialization**: frontend-developer (revisión: @code-reviewer con foco en accesibilidad)
**Story Points**: 8

## 🛠️ Skills & Tooling
**Claude Code Skills**: `component-reuse-first` (buscar componentes existentes; diseñar `MessageBubble` y `ChatPanel` para reutilización en #A-04 y #B-02)
**Custom Skill Needed**: No
**Skill Usage**: With Agent

## 📋 Summary
Página `/chat` para usuarios autenticados: envían un mensaje y ven la respuesta del asistente aparecer palabra a palabra consumiendo el stream de `POST /api/chat` (#01-01). Incluye botón Stop, estado de error recuperable y redirección de anónimos. Versión objetivo `v0.2.0` (Feature, minor).

**Metodología del workshop**: BDD (`/user-story` → `/issue` → `/task`), ver `prompts/02-bdd.md`.

**User story**
> **As a** usuario autenticado
> **I want** enviar un mensaje en `/chat` y ver la respuesta del asistente aparecer progresivamente
> **So that** obtengo respuestas sin esperar a que termine la generación completa

## 🎯 Scope
### In Scope
- `src/app/chat/page.tsx` — server component: `getSession()` + `redirect("/?error=Sign%20in%20to%20chat")` si no hay sesión; renderiza `<ChatPanel />`; `metadata.title = "Chat"`
- `src/app/chat/_components/chat-panel.tsx` — `"use client"`; estado, loop de fetch/stream, textarea + Send/Stop, auto-scroll
- `src/app/chat/_components/message-bubble.tsx` — burbuja presentacional user/assistant
- `src/app/page.tsx` — `Link href="/chat"` junto a "Sign out" cuando hay sesión
- `src/app/layout.tsx` — `metadata` title/description de la app

### Out of Scope
- Historial persistido y `/chat/[conversationId]` (#A-04)
- Sidebar, rename, delete (#EPIC-B)
- System prompt editable (#C-02)
- Cambios en `/api/chat` (#01-01 ya mergeado)

## 🔧 Technical Details
### Implementation Approach

**Props de `ChatPanel` definidas desde ahora** (sin usar en este slice, evitan refactor en #A-04):
```ts
type ChatPanelProps = {
	conversationId?: string;
	initialMessages?: ChatMessage[]; // tipo de src/server/ai/chat-schema.ts
};
```

**Estado**: `messages: useState<ChatMessage[]>`, `status: "idle" | "streaming" | "error"`, `input: string`, `AbortController` en `useRef`. Cada mensaje lleva un `id` generado en cliente (`crypto.randomUUID()`) para usarlo como `key` (Biome `noArrayIndexKey`).

**Consumo del stream (React 19):**
1. Al enviar: añadir el mensaje del usuario y un placeholder del asistente vacío (`setMessages` funcional); `status = "streaming"`.
2. `fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages }), signal })` — same-origin, las cookies de Better Auth viajan por defecto.
3. Si `!res.ok`: parsear JSON, `status = "error"`, quitar el placeholder, **conservar el texto en el input** para reintentar.
4. `const reader = res.body?.getReader()` (guard de `undefined`), `TextDecoder` con `{ stream: true }`; en cada chunk, append al último mensaje del asistente con update funcional.
5. Stop: `controller.abort()`; capturar `AbortError` y conservar el texto parcial; `status = "idle"`.
6. Send deshabilitado si `input.trim() === ""` o `status === "streaming"`.

No usar server actions para el chat (no pueden streamear texto). Sin `EventSource` (GET-only) ni parsing SSE: el body es texto plano.

**Accesibilidad**: `<label>` para el textarea, `type="button"` en Stop, `aria-live="polite"` en la burbuja del asistente en curso, foco vuelve al textarea al terminar.

**Biome**: `useButtonType`, `noArrayIndexKey`, `useExhaustiveDependencies`, atributos JSX ordenados, clases Tailwind ordenadas (`useSortedClasses`). Ejecutar `bun run check:write` antes de commitear. Reutilizar `inputClass`/`buttonClass` de `src/app/page.tsx` extrayéndolas a un módulo compartido si aplica (`component-reuse-first`).

**Tiers para `/task`:**
- Tier 0 (paralelo): **U1** `page.tsx` + guard + link en home + metadata — @frontend-developer, 2 SP. **U2** `message-bubble.tsx` — @frontend-developer, 1 SP.
- Tier 1: **U3** `chat-panel.tsx` streaming + Stop + estados de error — @frontend-developer, 5 SP.
- Tier 2: revisión de accesibilidad — @code-reviewer. Incluido en los 8 SP.

### Dependencies
- **Blocked by**: #01-01
- **Blocks**: #A-04
- **External dependencies**: ninguna nueva (React 19, Next 15, Tailwind v4 ya instalados)

### Interface Definition
```yaml
inputs:
  - session: Better Auth (getSession) — requerida para renderizar /chat
  - POST /api/chat: contrato de #01-01 (200 text/plain streaming; 400/401/502 JSON)
  - ChatPanelProps.conversationId: string, opcional (reservado para #A-04)
  - ChatPanelProps.initialMessages: ChatMessage[], opcional (reservado para #A-04)
outputs:
  - ruta /chat: página autenticada con conversación en memoria
  - componentes exportados: ChatPanel, MessageBubble (reutilizados por #A-04, #B-02)
  - redirect: /?error=Sign%20in%20to%20chat para anónimos
```

### Integration Points
- **Receives from**: #01-01 — stream de texto y tipo `ChatMessage`; `src/server/better-auth/server.ts` — `getSession()`
- **Provides to**: #A-04 — `ChatPanel` con `conversationId`/`initialMessages` y `MessageBubble`; #B-02 — layout que envolverá esta página

## ✅ Acceptance Criteria
Cada escenario Gherkin de la user story se mapea a un criterio verificable:

### Escenario 1 — Usuario autenticado recibe respuesta streameada
```gherkin
Feature: Chat con el asistente

  Scenario: Signed-in user receives a streamed reply
    Given I am signed in
    And I am on "/chat"
    When I type "Hola" and press Send
    Then my message appears in the conversation immediately
    And the assistant reply appears progressively while it streams
    And the Send button is disabled until streaming finishes
```
- [ ] El mensaje del usuario aparece antes de la primera respuesta; el texto del asistente crece por chunks; Send deshabilitado durante `streaming`

### Escenario 2 — Anónimo redirigido a sign in
```gherkin
  Scenario: Anonymous user is redirected to sign in
    Given I am not signed in
    When I open "/chat"
    Then I am redirected to "/" with the message "Sign in to chat"
```
- [ ] `GET /chat` sin sesión responde redirect a `/?error=Sign%20in%20to%20chat` y la home muestra el error

### Escenario 3 — Mensaje vacío no se envía
```gherkin
  Scenario: Empty message cannot be sent
    Given I am signed in and on "/chat"
    When the input is empty or only whitespace
    Then the Send button is disabled
```
- [ ] Send `disabled` con input vacío o solo espacios

### Escenario 4 — Fallo upstream visible y recuperable
```gherkin
  Scenario: Upstream failure is shown and recoverable
    Given I am signed in and on "/chat"
    And the chat API responds with status 502
    When I send a message
    Then I see "Something went wrong, try again"
    And my message stays in the input so I can retry
```
- [ ] Con 502 (p. ej. `DEEPSEEK_API_KEY` inválida) se muestra el error y el texto sigue en el input

### Escenario 5 — Usuario detiene una respuesta larga
```gherkin
  Scenario: User stops a long reply
    Given the assistant is streaming a reply
    When I press Stop
    Then streaming ends and the partial reply is kept
```
- [ ] Stop aborta el fetch, el texto parcial permanece y Send vuelve a habilitarse

### Generales
- [ ] `bun run typecheck` y `bun run check` pasan
- [ ] Link "Chat" visible en `/` solo con sesión
- [ ] `/code-review` sin hallazgos críticos (accesibilidad incluida)
- [ ] Interface contract validado por #A-04

## 🧪 Testing Strategy
### Unit Tests
- (Diferido a #C-03) reducción de chunks → mensaje del asistente; `Send` deshabilitado con whitespace

### Integration Tests
- Manual en navegador: los 5 escenarios anteriores contra `bun dev` con `DEEPSEEK_API_KEY` real
- Escenario 4 forzado con `DEEPSEEK_API_KEY=invalid` en `.env`
- Opcional: `/merge-and-test` con Chrome MCP para escenarios 1–3 y 5

## 📎 Additional Context
### Related Issues
- Depends on: #01-01
- Related to: #PARENT, #A-04, #B-02

### References
- `~/.claude/templates/GH_USER_STORY_TEMPLATE.md` — formato de la user story generada por `/user-story`
- `src/app/page.tsx` — patrón de guard y `?error=`; clases `inputClass`/`buttonClass` a reutilizar
- Contrato `POST /api/chat` en #01-01

### Technical Notes
- Versión objetivo `v0.2.0` (Feature → minor). Etiqueta `v0.2.0`.
- `res.body` puede ser `null` en TypeScript estricto: guard explícito.
- React 19 agrupa los `setMessages` por chunk; suficiente para la demo (opcional: buffer con `requestAnimationFrame`).
- Cookies de Better Auth solo viajan same-origin: probar contra el mismo `bun dev` que sirve la API.

## 🏷️ Labels
`sub-issue`, `frontend`, `bdd`, `v0.2.0`, `P0`, `story-points:8`

## 📅 Timeline
- **Start**: tras merge de #01-01
- **Target Completion**: antes del workshop (pre-ejecutado) o en la demo 2
- **Estimated**: 8 story points

## 🤝 Handoff Checklist
- [ ] Interface contract documented (`ChatPanelProps` con `conversationId`/`initialMessages`)
- [ ] API endpoints/methods documented (consumo de `POST /api/chat` en `CLAUDE.md`)
- [ ] Data models/schemas defined (`ChatMessage` reutilizado desde `chat-schema.ts`)
- [ ] Error handling patterns established (`!res.ok` → error recuperable; `AbortError` → parcial conservado)
- [ ] Integration points validated (5 escenarios en navegador)
- [ ] Handoff notes for dependent teams/agents: #A-04 debe pasar `conversationId` e `initialMessages` y leer `X-Conversation-Id`; #B-02 envuelve `/chat` en `layout.tsx` sin tocar `ChatPanel`
