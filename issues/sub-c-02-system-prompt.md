---
id: "C-02"
title: "[Sub-issue] System prompt configurable por conversación"
labels: ["sub-issue", "backend", "frontend", "P2", "story-points:5"]
story_points: 5
assignee: "ai-engineer"
priority: "P2"
epic: "EPIC-C"
dependencies: ["A-03", "A-04"]
---

# [Sub-issue] System prompt configurable por conversación

## 🔗 Parent Issue
Part of #EPIC-C - System prompt por conversación, rate limit y tests

## 👤 Assignment
**Assigned Agent/Team Member**: @ai-engineer
**Specialization**: ai-engineer
**Story Points**: 5

## 🛠️ Skills & Tooling
**Claude Code Skills**: claude-api
**Custom Skill Needed**: No (recomendación opcional `deepseek-anthropic-compat` en #EPIC-C)
**Skill Usage**: With Agent

## 📋 Summary
Permitir al usuario definir un system prompt propio para cada conversación. La columna `conversation.systemPrompt` existe desde #A-01 y `route.ts` ya aplica `conversation.systemPrompt ?? DEFAULT_SYSTEM_PROMPT` desde #A-03; este sub-issue añade la action para editarlo y un panel colapsable en la cabecera del chat.

## 🎯 Scope
### In Scope
- `src/server/chat/actions.ts`: **añadir al final** `updateSystemPromptAction(prevState, formData)` con campos `conversationId` (uuid) y `systemPrompt` (string 0–4000; vacío → `null` para volver al default). Guard `getSession()`, delega en `updateSystemPrompt(userId, id, prompt | null)` de #A-02, `revalidatePath(\`/chat/${id}\`)`.
- Archivo nuevo (propiedad exclusiva): `src/app/chat/_components/chat-settings.tsx` (`"use client"`): `<details>` "System prompt" con `textarea`, botón "Guardar" y "Restablecer", `useActionState`, mensaje de error/ok.
- `src/app/chat/[conversationId]/page.tsx`: cargar `systemPrompt` de la conversación y renderizar `<ChatSettings conversationId systemPrompt />` sobre `<ChatPanel />`.
- Nota en `src/server/ai/prompts.ts` documentando que `DEFAULT_SYSTEM_PROMPT` es el fallback.

### Out of Scope
- Cambios en `route.ts` (ya lee la columna, #A-03).
- Rate limit (→ #C-01). Tests (→ #C-03).
- Prompt global editable por admin.

## 🔧 Technical Details
### Implementation Approach
- Parámetro `system` del SDK: DeepSeek lo soporta tal cual (string). No enviar `cache_control` ni bloques `system` con `cache_control`, DeepSeek los rechaza.
- Límite 4000 chars para acotar coste por petición.
- `details/summary` nativos: sin dependencia extra y accesible por teclado.
- La página `[conversationId]` usa `await params` (Next 15).

### Dependencies
- **Blocked by**: #A-03, #A-04
- **Blocks**: #C-03
- **External dependencies**: ninguna nueva

### Interface Definition
```yaml
inputs:
  - updateSystemPromptAction(prevState: ActionState, formData: FormData): conversationId (uuid), systemPrompt (string 0-4000)
  - ChatSettings props: { conversationId: string, systemPrompt: string | null }
outputs:
  - ActionState: { ok: true } | { ok: false, error: string }
  - conversation.systemPrompt actualizado; la siguiente petición a /api/chat lo usa
```

### Integration Points
- **Receives from**: #A-02 - `updateSystemPrompt`; #A-03 - la ruta aplica la columna; #A-04 - página que carga la conversación.
- **Provides to**: #C-03 - caso de test "prompt personalizado llega al parámetro `system`".

## ✅ Acceptance Criteria
- [ ] Guardar un system prompt y enviar un mensaje: el mock/inspección muestra `system` igual al texto guardado.
- [ ] "Restablecer" deja `systemPrompt = null` y la ruta vuelve a `DEFAULT_SYSTEM_PROMPT`.
- [ ] Una conversación con prompt propio no altera otras.
- [ ] Prompt >4000 chars devuelve error de validación.
- [ ] `bun run typecheck && bun run check` en verde.

## 🧪 Testing Strategy
### Unit Tests
- Diferido a #C-03: la action con sesión mockeada; validación de longitud.

### Integration Tests
- Route handler con conversación que tiene `systemPrompt` → llamada al cliente mockeado con ese `system` (→ #C-03).

## 📎 Additional Context
### Related Issues
- Depends on: #A-03, #A-04
- Related to: #B-01 (mismo `actions.ts`), #C-03

### References
- DeepSeek Anthropic API (parámetros soportados): https://api-docs.deepseek.com/guides/anthropic_api
- Skill `claude-api`: parámetro `system` en `messages.stream()`

### Technical Notes
_Si #B-01 aún no está en `main`, crear `actions.ts` con solo esta action y dejar que el merge añada las otras; evitar reordenar el archivo para no generar conflictos._

## 🏷️ Labels
`sub-issue`, `backend`, `frontend`, `P2`, `story-points:5`

## 📅 Timeline
- **Start**: tier 0 de #EPIC-C
- **Target Completion**: mismo tier
- **Estimated**: 5 story points

## 🤝 Handoff Checklist
- [ ] Firma de `updateSystemPromptAction` documentada
- [ ] Props de `ChatSettings` documentadas
- [ ] Límite de longitud y semántica de vacío→null anotados
- [ ] Sin parámetros no soportados por DeepSeek
- [ ] Notas de handoff para #C-03
