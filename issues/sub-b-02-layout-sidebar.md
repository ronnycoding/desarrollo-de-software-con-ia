---
id: "B-02"
title: "[Sub-issue] Layout /chat con sidebar de conversaciones"
labels: ["sub-issue", "frontend", "P1", "story-points:5"]
story_points: 5
assignee: "frontend-developer"
priority: "P1"
epic: "EPIC-B"
dependencies: ["A-02", "A-04"]
---

# [Sub-issue] Layout /chat con sidebar de conversaciones

## 🔗 Parent Issue
Part of #EPIC-B - Sidebar de conversaciones con renombrar y eliminar

## 👤 Assignment
**Assigned Agent/Team Member**: @frontend-developer
**Specialization**: frontend-developer
**Story Points**: 5

## 🛠️ Skills & Tooling
**Claude Code Skills**: component-reuse-first
**Custom Skill Needed**: No
**Skill Usage**: With Agent

## 📋 Summary
Añadir `src/app/chat/layout.tsx` que envuelve `/chat` y `/chat/[conversationId]` con un sidebar server-rendered: lista de conversaciones del usuario (`listConversations(userId)` de #A-02) ordenadas por última actividad, enlace "Nueva conversación" a `/chat`, y resaltado de la conversación activa mediante un pequeño componente cliente con `usePathname()`.

## 🎯 Scope
### In Scope
- Archivos nuevos (propiedad exclusiva en este tier):
  - `src/app/chat/layout.tsx` — server component; `getSession()` guard con `redirect("/?error=Sign%20in%20to%20chat")`; grid `aside + main`.
  - `src/app/chat/_components/sidebar.tsx` — server component; recibe `userId`, llama a `listConversations`, renderiza `<SidebarLink>` por conversación y el enlace "Nueva conversación".
  - `src/app/chat/_components/sidebar-link.tsx` — `"use client"`; `usePathname()` para aplicar estilo activo cuando `pathname === \`/chat/${id}\``.
- Estado vacío: "Aún no tienes conversaciones".
- Responsive mínimo: sidebar oculto en `< md` con el enlace "Nueva conversación" visible.
- Reutilizar `inputClass`/`buttonClass` y la paleta de `src/app/page.tsx` (skill `component-reuse-first`).

### Out of Scope
- Renombrar/eliminar (→ #B-03 reemplaza `<SidebarLink>` por `<ConversationItem>` en `sidebar.tsx`).
- Cambios en `chat-panel.tsx` o `[conversationId]/page.tsx` (→ #A-04).

## 🔧 Technical Details
### Implementation Approach
- El layout ya garantiza sesión; las páginas hijas pueden mantener su propio guard (idempotente).
- `Sidebar` es async server component: `const conversations = await listConversations(userId);`.
- Claves de lista: `conversation.id` (nunca índice; regla Biome `noArrayIndexKey`).
- Atributos JSX y clases Tailwind ordenados (`bun run check:write`).
- `Link` de `next/link` para navegación; `prefetch` por defecto.

### Dependencies
- **Blocked by**: #A-02, #A-04
- **Blocked by (branch)**: en `/work-on-opens` la rama base es la de #A-04.
- **Blocks**: #B-03
- **External dependencies**: ninguna nueva

### Interface Definition
```yaml
inputs:
  - Sidebar props: { userId: string }
  - SidebarLink props: { id: string, title: string }
  - listConversations(userId): Array<{ id: string, title: string, updatedAt: Date }>
outputs:
  - layout: <aside> con sidebar + <main>{children}</main>
  - sidebar.tsx expone un punto de montaje por conversación que #B-03 sustituirá por <ConversationItem>
```

### Integration Points
- **Receives from**: #A-02 - `listConversations(userId)`; #A-04 - ruta `/chat/[conversationId]` para el enlace activo.
- **Provides to**: #B-03 - `sidebar.tsx` con la iteración por conversación lista para montar `ConversationItem`.

## ✅ Acceptance Criteria
- [ ] `/chat` y `/chat/[id]` muestran el sidebar con las conversaciones del usuario autenticado, ordenadas por `updatedAt desc`.
- [ ] Usuario anónimo en `/chat` es redirigido a `/` con `?error=`.
- [ ] La conversación abierta aparece resaltada.
- [ ] "Nueva conversación" navega a `/chat` y limpia el panel.
- [ ] Estado vacío visible cuando no hay conversaciones.
- [ ] `bun run typecheck && bun run check` en verde.

## 🧪 Testing Strategy
### Unit Tests
- Diferido a #C-03.

### Integration Tests
- Manual (Chrome MCP en `/merge-and-test`): iniciar sesión, crear dos conversaciones, comprobar orden y resaltado al cambiar de ruta.

## 📎 Additional Context
### Related Issues
- Depends on: #A-02, #A-04
- Related to: #B-03

### References
- `src/app/page.tsx` — clases y estilo existentes
- `src/app/layout.tsx` — root layout (no modificar)

### Technical Notes
_`usePathname` obliga a que el enlace sea cliente; mantener ese componente mínimo para no convertir todo el sidebar en cliente._

## 🏷️ Labels
`sub-issue`, `frontend`, `P1`, `story-points:5`

## 📅 Timeline
- **Start**: tier 0 de #EPIC-B
- **Target Completion**: mismo tier
- **Estimated**: 5 story points

## 🤝 Handoff Checklist
- [ ] Props de `Sidebar` y `SidebarLink` documentadas
- [ ] Punto de montaje por conversación señalado con comentario para #B-03
- [ ] Clases compartidas extraídas si se repiten más de dos veces
- [ ] Estado vacío y responsive verificados
- [ ] Notas de handoff para #B-03 en la PR
