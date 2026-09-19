---
id: "A-04"
title: "[Sub-issue] Página /chat/[conversationId] con historial"
labels: ["sub-issue", "frontend", "P0", "story-points:3"]
story_points: 3
assignee: "frontend-developer"
priority: "P0"
epic: "EPIC-A"
dependencies: ["A-02", "01-02"]
---

# [SUB-ISSUE] Página /chat/[conversationId] con historial

## 🔗 Parent Issue
Part of #EPIC-A - Persistencia de conversaciones y mensajes

## 👤 Assignment
**Assigned Agent/Team Member**: @frontend-developer
**Specialization**: frontend-developer
**Story Points**: 3

## 🛠️ Skills & Tooling
**Claude Code Skills**: `component-reuse-first` (reutilizar `ChatPanel` y `MessageBubble` de #01-02)
**Custom Skill Needed**: No
**Skill Usage**: With Agent

## 📋 Summary
Crear la ruta dinámica `/chat/[conversationId]` que carga el historial de la conversación del usuario autenticado y lo pasa a `ChatPanel`, y hacer que `ChatPanel` navegue a la URL de la conversación cuando `/api/chat` devuelve un `X-Conversation-Id` nuevo.

## 🎯 Scope
### In Scope
- `src/app/chat/[conversationId]/page.tsx` (server component)
- `src/app/chat/_components/chat-panel.tsx`: usar las props `conversationId` / `initialMessages` (ya definidas en #01-02), enviar `conversationId` en el body, leer el header y `router.replace`
- 404 (`notFound()`) si la conversación no existe o no es del usuario

### Out of Scope
- Layout con sidebar (#B-02)
- Renombrar/borrar (#B-01, #B-03)
- Edición del system prompt (#C-02)

## 🔧 Technical Details
### Implementation Approach
```ts
// src/app/chat/[conversationId]/page.tsx
export default async function ConversationPage({
	params,
}: {
	params: Promise<{ conversationId: string }>;
}) {
	const { conversationId } = await params; // Next 15: params es Promise
	const session = await getSession();
	if (!session) redirect("/?error=Sign%20in%20to%20chat");
	const conv = await getConversation(session.user.id, conversationId);
	if (!conv) notFound();
	const history = await listMessages(session.user.id, conversationId);
	return (
		<ChatPanel
			conversationId={conv.id}
			initialMessages={history.map((m) => ({ role: m.role, content: m.content }))}
		/>
	);
}
```

En `ChatPanel`: estado `conversationId` inicializado desde la prop; tras `fetch`, `const id = res.headers.get("x-conversation-id")`; si la prop era `undefined` y llega un id, `setConversationId(id)` y `router.replace(\`/chat/${id}\`)` (`useRouter` de `next/navigation`). No refetch del historial: el estado local ya lo contiene.

### Dependencies
- **Blocked by**: #A-02, #01-02
- **Blocks**: #B-02, #C-02
- **External dependencies**: ninguna nueva

### Interface Definition
```yaml
inputs:
  - params.conversationId: string (uuid) desde la URL
  - ChatPanel props: { conversationId?: string; initialMessages?: ChatMessage[] }
outputs:
  - Página server-rendered con historial en orden cronológico
  - ChatPanel envía body.conversationId y actualiza la URL con router.replace
```

### Integration Points
- **Receives from**: #A-02 - `getConversation`, `listMessages`; #A-03 - header `X-Conversation-Id`; #01-02 - `ChatPanel`, `MessageBubble`, tipo `ChatMessage`
- **Provides to**: #B-02 - la ruta `/chat/[conversationId]` que enlaza el sidebar; #C-02 - punto donde se pasa `conv.systemPrompt` a la UI de settings

## ✅ Acceptance Criteria
- [ ] Recargar `/chat/<id>` muestra todos los mensajes previos en orden
- [ ] `/chat/<id-de-otro-usuario>` y `/chat/<uuid-inexistente>` devuelven 404
- [ ] Enviar el primer mensaje desde `/chat` cambia la URL a `/chat/<id>` sin perder el streaming en curso
- [ ] Mensajes siguientes reutilizan el mismo `conversationId`
- [ ] `bun run typecheck` y `bun run check` en verde (Biome: `useExhaustiveDependencies`, `noArrayIndexKey`, atributos JSX ordenados)

## 🧪 Testing Strategy
### Unit Tests
- No aplica en este tier; cubierto por #C-03 a nivel de ruta y por prueba manual

### Integration Tests
- Chrome DevTools MCP (en `/merge-and-test`): sign-in → `/chat` → enviar mensaje → URL cambia → recargar → historial visible

## 📎 Additional Context
### Related Issues
- Depends on: #A-02, #01-02
- Related to: #A-03, #B-02, #C-02

### References
- https://nextjs.org/docs/app/api-reference/file-conventions/page#params-optional
- https://nextjs.org/docs/app/api-reference/functions/use-router

### Technical Notes
- Cookies de Better Auth solo viajan same-origin: probar contra el `bun dev` del propio worktree.
- `notFound()` requiere que exista (o se cree) `src/app/not-found.tsx`; el default de Next es suficiente.

## 🏷️ Labels
`sub-issue`, `frontend`, `P0`, `story-points:3`

## 📅 Timeline
- **Start**: Tier 2 del epic (paralelo con #A-03)
- **Target Completion**: tras el workshop
- **Estimated**: 3 story points

## 🤝 Handoff Checklist
- [ ] Interface contract documented
- [ ] Props de `ChatPanel` documentadas
- [ ] Data models/schemas defined (`ChatMessage` reutilizado)
- [ ] Error handling patterns established (`redirect` sin sesión, `notFound` sin conversación)
- [ ] Integration points validated con #A-03 (header) y #B-02 (ruta)
- [ ] Handoff notes para @frontend-developer (#B-02) y @ai-engineer (#C-02)

**Archivos de propiedad exclusiva en este tier**: `src/app/chat/[conversationId]/page.tsx`, `src/app/chat/_components/chat-panel.tsx`
