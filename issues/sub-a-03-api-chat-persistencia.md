---
id: "A-03"
title: "[Sub-issue] /api/chat persiste mensajes y devuelve X-Conversation-Id"
labels: ["sub-issue", "backend", "P0", "story-points:5"]
story_points: 5
assignee: "backend-architect"
priority: "P0"
epic: "EPIC-A"
dependencies: ["A-02"]
---

# [SUB-ISSUE] /api/chat persiste mensajes y devuelve X-Conversation-Id

## 🔗 Parent Issue
Part of #EPIC-A - Persistencia de conversaciones y mensajes

## 👤 Assignment
**Assigned Agent/Team Member**: @backend-architect
**Specialization**: backend-architect
**Story Points**: 5

## 🛠️ Skills & Tooling
**Claude Code Skills**: `claude-api` (SDK `@anthropic-ai/sdk`: `messages.stream()`, `finalMessage()`, `abort()`)
**Custom Skill Needed**: No
**Skill Usage**: With Agent

## 📋 Summary
Extender `POST /api/chat` (creado en #01-01) para que cada petición pertenezca a una conversación persistida: acepta `conversationId` opcional, crea la conversación en el primer mensaje, guarda el mensaje del usuario antes de streamear y el del asistente al terminar, aplica el `systemPrompt` de la conversación y devuelve el id en el header `X-Conversation-Id`.

## 🎯 Scope
### In Scope
- `src/server/ai/chat-schema.ts`: campo `conversationId: z.string().uuid().optional()`
- `src/app/api/chat/route.ts`: lógica de persistencia descrita abajo
- Respuesta 404 `{ error: "Conversation not found" }` si el id no existe o es de otro usuario

### Out of Scope
- UI que consume el header (#A-04)
- Rate limiting (#C-01) y edición del system prompt (#C-02)
- Tests de la ruta (#C-03)

## 🔧 Technical Details
### Implementation Approach
Orden dentro del handler, todo **antes** de construir el `ReadableStream`:
1. `getSession()` → 401 si no hay sesión.
2. `chatRequestSchema.safeParse(body)` → 400 con `issues`.
3. Si viene `conversationId`: `getConversation(userId, id)`; `null` → 404. Si no viene: `createConversation(userId, title)` con `title = último mensaje user recortado a 60 caracteres`.
4. `appendMessage(userId, conversationId, "user", lastUserMessage.content)`.
5. `system = conversation.systemPrompt ?? DEFAULT_SYSTEM_PROMPT`.
6. `const stream = deepseek.messages.stream({ model, max_tokens, system, messages }, { signal: req.signal })`.
7. En el `ReadableStream`: encolar `text_delta`; en `flush`/tras el bucle `const final = await stream.finalMessage()`, concatenar bloques `text` y `appendMessage(userId, conversationId, "assistant", text)`. Si el cliente cancela (`cancel()` → `stream.abort()`), persistir el texto parcial acumulado.
8. `Response` con headers `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `X-Conversation-Id: <uuid>`.

Solo enviar a DeepSeek `model`, `max_tokens`, `system`, `messages` (y `temperature` opcional); nada de `top_k`, `thinking`, `output_config`, `cache_control`, `betas`.

### Dependencies
- **Blocked by**: #A-02
- **Blocks**: #C-02
- **External dependencies**: `@anthropic-ai/sdk`, DeepSeek Anthropic-compatible endpoint

### Interface Definition
```yaml
inputs:
  - body.messages: { role: "user"|"assistant", content: string }[] (1..50, último role "user")
  - body.conversationId: string uuid, opcional
  - cookie de sesión Better Auth
outputs:
  - 200: text/plain streameado + header X-Conversation-Id
  - 400: { error: "Invalid request", issues: ZodIssue[] }
  - 401: { error: "Unauthorized" }
  - 404: { error: "Conversation not found" }
  - 502: { error: "Upstream error" } (Anthropic.APIError antes de iniciar el stream)
```

### Integration Points
- **Receives from**: #A-02 - `getConversation`, `createConversation`, `appendMessage`; #01-01 - cliente `deepseek`, `DEFAULT_SYSTEM_PROMPT`, `chatRequestSchema`
- **Provides to**: #A-04 - header `X-Conversation-Id` para `router.replace`; #C-02 - la ruta ya honra `conversation.systemPrompt`

## ✅ Acceptance Criteria
- [ ] Primer POST sin `conversationId` crea la conversación y devuelve `X-Conversation-Id`
- [ ] POST con `conversationId` de otro usuario → 404 sin llamar a DeepSeek
- [ ] Tras un intercambio completo hay exactamente 2 filas nuevas en `message` (user y assistant) y `updatedAt` de la conversación cambió
- [ ] Abortar desde el cliente conserva el texto parcial del asistente en la base
- [ ] `bun run typecheck` y `bun run check` en verde
- [ ] Revisión de @security-auditor: la API key nunca se loguea; 401/404 se resuelven antes de cualquier llamada upstream

## 🧪 Testing Strategy
### Unit Tests
- `chat-schema`: `conversationId` inválido (no uuid) → error de zod

### Integration Tests
- `curl -N -X POST localhost:3000/api/chat -H 'content-type: application/json' -H 'cookie: better-auth.session_token=...' -d '{"messages":[{"role":"user","content":"hola"}]}' -i` muestra el header y chunks progresivos
- Repetir con el `conversationId` recibido y comprobar 4 mensajes en `pg-drizzle_message`

## 📎 Additional Context
### Related Issues
- Depends on: #A-02
- Related to: #01-01, #A-04, #C-01, #C-02, #C-03

### References
- `~/.claude` skill `claude-api` → `typescript/claude-api/streaming.md`
- https://api-docs.deepseek.com/guides/anthropic_api

### Technical Notes
- No llamar a `getSession()`/`headers()` una vez iniciada la respuesta.
- `finalMessage()` puede rechazar si el stream fue abortado: capturar `AbortError` y persistir lo acumulado.
- Runtime Node (no `edge`): `postgres` y Better Auth lo requieren.

## 🏷️ Labels
`sub-issue`, `backend`, `P0`, `story-points:5`

## 📅 Timeline
- **Start**: Tier 2 del epic (paralelo con #A-04)
- **Target Completion**: tras el workshop
- **Estimated**: 5 story points

## 🤝 Handoff Checklist
- [ ] Interface contract documented
- [ ] API endpoints/methods documented (tabla de respuestas arriba)
- [ ] Data models/schemas defined (`chatRequestSchema` con `conversationId`)
- [ ] Error handling patterns established (401 → 400 → 404 → 502)
- [ ] Integration points validated con #A-04
- [ ] Handoff notes para @ai-engineer (#C-02) y @test-automator (#C-03)

**Archivos de propiedad exclusiva en este tier**: `src/app/api/chat/route.ts`, `src/server/ai/chat-schema.ts`
