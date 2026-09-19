---
id: "B-03"
title: "[Sub-issue] Item de conversación: renombrar inline y eliminar con confirmación"
labels: ["sub-issue", "frontend", "P1", "story-points:3"]
story_points: 3
assignee: "frontend-developer"
priority: "P1"
epic: "EPIC-B"
dependencies: ["B-01", "B-02"]
---

# [Sub-issue] Item de conversación: renombrar inline y eliminar con confirmación

## 🔗 Parent Issue
Part of #EPIC-B - Sidebar de conversaciones con renombrar y eliminar

## 👤 Assignment
**Assigned Agent/Team Member**: @frontend-developer
**Specialization**: frontend-developer
**Story Points**: 3

## 🛠️ Skills & Tooling
**Claude Code Skills**: component-reuse-first
**Custom Skill Needed**: No
**Skill Usage**: With Agent

## 📋 Summary
Crear `src/app/chat/_components/conversation-item.tsx` (`"use client"`) que muestra el título de una conversación, permite renombrarlo inline (doble clic o botón "Renombrar" → input + Enter/Escape) y eliminarla con confirmación, usando `useActionState` con las actions de #B-01. Sustituye el `<SidebarLink>` en `sidebar.tsx` (#B-02).

## 🎯 Scope
### In Scope
- Archivo nuevo (propiedad exclusiva): `src/app/chat/_components/conversation-item.tsx`.
- Edición mínima en `src/app/chat/_components/sidebar.tsx`: importar y montar `<ConversationItem id title active />` en lugar de `<SidebarLink>`.
- Estados: `viewing | editing | confirmingDelete`; `useActionState(renameConversationAction, initialActionState)` y otro para delete.
- Mostrar `state.error` inline cuando `ok === false`.
- Confirmación de borrado **sin** `window.confirm` (bloquea la automatización del navegador): dos botones "Eliminar" / "Cancelar" renderizados en el propio ítem.
- Accesibilidad: `type="button"` en todos los botones no-submit, `aria-label` en iconos, foco al input al entrar en edición.

### Out of Scope
- Lógica de servidor (→ #B-01).
- Layout y listado (→ #B-02).

## 🔧 Technical Details
### Implementation Approach
- Dos `<form action={formAction}>` con campos ocultos `conversationId` y, para delete, `active` (`String(active)`).
- Enter envía el form de rename; Escape vuelve a `viewing`.
- Tras `ok === true` volver a `viewing`; `revalidatePath` en la action refresca el título.
- `useTransition`/`pending` de `useActionState` para deshabilitar botones durante la mutación.
- Biome: `useButtonType`, `useExhaustiveDependencies`, atributos ordenados.

### Dependencies
- **Blocked by**: #B-01, #B-02
- **Blocks**: ninguno
- **External dependencies**: ninguna nueva

### Interface Definition
```yaml
inputs:
  - props: { id: string, title: string, active: boolean }
  - actions: renameConversationAction, deleteConversationAction (ActionState) desde src/server/chat/actions.ts
outputs:
  - UI: enlace a /chat/[id], modo edición inline, confirmación de borrado
  - side effects: llamadas a las actions; redirect gestionado por la action cuando active=true
```

### Integration Points
- **Receives from**: #B-01 - actions y `ActionState`; #B-02 - punto de montaje en `sidebar.tsx`.
- **Provides to**: usuario final; ningún otro sub-issue depende de este.

## ✅ Acceptance Criteria
- [ ] Renombrar inline actualiza el título en el sidebar sin recarga completa.
- [ ] Eliminar muestra confirmación inline; confirmar elimina y, si era la activa, navega a `/chat`.
- [ ] Errores de la action se muestran junto al ítem.
- [ ] Ningún `window.confirm`/`alert`.
- [ ] Navegación con teclado: Enter confirma, Escape cancela.
- [ ] `bun run typecheck && bun run check` en verde.

## 🧪 Testing Strategy
### Unit Tests
- Diferido a #C-03.

### Integration Tests
- Manual (Chrome MCP): renombrar, eliminar activa, eliminar no activa, cancelar ambas.

## 📎 Additional Context
### Related Issues
- Depends on: #B-01, #B-02
- Related to: #EPIC-B

### References
- React 19 `useActionState`: https://react.dev/reference/react/useActionState

### Technical Notes
_Evitar diálogos nativos: `/merge-and-test` usa Chrome MCP y un `confirm()` bloquea la sesión._

## 🏷️ Labels
`sub-issue`, `frontend`, `P1`, `story-points:3`

## 📅 Timeline
- **Start**: tier 1 de #EPIC-B
- **Target Completion**: mismo tier
- **Estimated**: 3 story points

## 🤝 Handoff Checklist
- [ ] Props documentadas
- [ ] Sin diálogos nativos
- [ ] Estados y errores cubiertos
- [ ] `sidebar.tsx` actualizado con `ConversationItem`
- [ ] Capturas en la PR
