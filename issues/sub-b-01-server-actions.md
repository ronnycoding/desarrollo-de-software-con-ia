---
id: "B-01"
title: "[Sub-issue] Server actions renombrar/eliminar conversación"
labels: ["sub-issue", "backend", "P1", "story-points:3"]
story_points: 3
assignee: "backend-architect"
priority: "P1"
epic: "EPIC-B"
dependencies: ["A-02"]
---

# [Sub-issue] Server actions renombrar/eliminar conversación

## 🔗 Parent Issue
Part of #EPIC-B - Sidebar de conversaciones con renombrar y eliminar

## 👤 Assignment
**Assigned Agent/Team Member**: @backend-architect
**Specialization**: backend-architect
**Story Points**: 3

## 🛠️ Skills & Tooling
**Claude Code Skills**: standalone
**Custom Skill Needed**: No
**Skill Usage**: Standalone

## 📋 Summary
Crear `src/server/chat/actions.ts` con dos server actions (`"use server"`) que envuelven el repositorio de #A-02: `renameConversationAction` y `deleteConversationAction`. Ambas verifican la sesión con `getSession()`, validan el `FormData` con zod, delegan en el repositorio filtrando por `userId`, y revalidan `/chat` para que el sidebar (#B-02) se actualice.

## 🎯 Scope
### In Scope
- Archivo nuevo (propiedad exclusiva en este tier): `src/server/chat/actions.ts`.
- `renameConversationAction(prevState, formData)`: campos `conversationId` (uuid) y `title` (1–120 chars, trim). Devuelve `{ ok: true } | { ok: false, error: string }` para `useActionState`.
- `deleteConversationAction(prevState, formData)`: campo `conversationId` (uuid) y `active` (`"true"|"false"`). Si `active === "true"`, `redirect("/chat")` tras eliminar.
- Guard: `const session = await getSession(); if (!session) return { ok: false, error: "Unauthorized" };` como primera línea de cada action.
- `revalidatePath("/chat", "layout")` tras cada mutación exitosa.
- Errores del repositorio (conversación inexistente o de otro usuario) → `{ ok: false, error: "Conversation not found" }`, nunca lanzar.

### Out of Scope
- UI de los formularios (→ #B-02, #B-03).
- `updateSystemPromptAction` (→ #C-02, se añade al final de este mismo archivo).
- Cambios en el repositorio `src/server/chat/conversations.ts` (→ #A-02).

## 🔧 Technical Details
### Implementation Approach
- Seguir el patrón de `src/app/page.tsx`: helper `getString(formData, key)`, `headers()` no es necesario porque `getSession()` ya lo resuelve.
- Schemas zod locales al archivo:
  ```ts
  const renameSchema = z.object({ conversationId: z.string().uuid(), title: z.string().trim().min(1).max(120) });
  const deleteSchema = z.object({ conversationId: z.string().uuid(), active: z.enum(["true", "false"]).default("false") });
  ```
- Tipo exportado `ActionState = { ok: true } | { ok: false; error: string }` y estado inicial `initialActionState`.
- `redirect()` debe ir fuera del `try/catch` (lanza internamente).
- Biome: tabs, `import type`, imports ordenados.

### Dependencies
- **Blocked by**: #A-02
- **Blocks**: #B-03
- **External dependencies**: `zod`, `next/cache` (`revalidatePath`), `next/navigation` (`redirect`)

### Interface Definition
```yaml
inputs:
  - renameConversationAction(prevState: ActionState, formData: FormData): FormData con conversationId (uuid) y title (string 1-120)
  - deleteConversationAction(prevState: ActionState, formData: FormData): FormData con conversationId (uuid) y active ("true"|"false")
outputs:
  - ActionState: { ok: true } | { ok: false, error: string }
  - side effects: revalidatePath("/chat","layout"); redirect("/chat") si se elimina la activa
```

### Integration Points
- **Receives from**: #A-02 - `renameConversation(userId, id, title)`, `deleteConversation(userId, id)`.
- **Provides to**: #B-03 - las dos actions con firma compatible con `useActionState`.

## ✅ Acceptance Criteria
- [ ] `src/server/chat/actions.ts` exporta `renameConversationAction`, `deleteConversationAction`, `ActionState`, `initialActionState`.
- [ ] Sin sesión devuelve `{ ok: false, error: "Unauthorized" }` sin tocar la base de datos.
- [ ] Un `conversationId` de otro usuario devuelve `Conversation not found`.
- [ ] Título vacío o >120 chars devuelve error de validación legible.
- [ ] Eliminar con `active=true` redirige a `/chat`.
- [ ] `bun run typecheck && bun run check` en verde.

## 🧪 Testing Strategy
### Unit Tests
- Diferido a #C-03 (no existe `bun test` hasta #A-02). Verificación manual con `curl` no aplica: probar desde #B-03.

### Integration Tests
- Renombrar desde el sidebar actualiza el título tras `revalidatePath` (verificado en #B-03).

## 📎 Additional Context
### Related Issues
- Depends on: #A-02
- Related to: #B-03, #C-02

### References
- Patrón de server actions: `src/app/page.tsx`
- `getSession()`: `src/server/better-auth/server.ts`

### Technical Notes
_`redirect()` lanza una excepción especial de Next; no envolverla en `try/catch` o la action devolverá un error falso._

## 🏷️ Labels
`sub-issue`, `backend`, `P1`, `story-points:3`

## 📅 Timeline
- **Start**: tier 0 de #EPIC-B
- **Target Completion**: mismo tier
- **Estimated**: 3 story points

## 🤝 Handoff Checklist
- [ ] `ActionState` e `initialActionState` exportados y documentados
- [ ] Nombres de campos de `FormData` fijados (`conversationId`, `title`, `active`)
- [ ] Mensajes de error estables (`Unauthorized`, `Conversation not found`)
- [ ] `revalidatePath` confirmado en ambas actions
- [ ] Notas de handoff para #B-03 en la PR
