---
id: "A-02"
title: "[Sub-issue] Repositorio de conversaciones user-scoped + setup bun test"
labels: ["sub-issue", "backend", "P0", "story-points:5"]
story_points: 5
assignee: "backend-architect"
priority: "P0"
epic: "EPIC-A"
dependencies: ["A-01"]
---

# [SUB-ISSUE] Repositorio de conversaciones user-scoped + setup bun test

## 🔗 Parent Issue
Part of #EPIC-A - Persistencia de conversaciones y mensajes

## 👤 Assignment
**Assigned Agent/Team Member**: @backend-architect
**Specialization**: backend-architect
**Story Points**: 5

## 🛠️ Skills & Tooling
**Claude Code Skills**: standalone
**Custom Skill Needed**: No
**Skill Usage**: Standalone

## 📋 Summary
Crear `src/server/chat/conversations.ts`, la única capa que toca las tablas `conversation`/`message`. Todas las funciones reciben `userId` como primer argumento y filtran por él, de modo que ni la ruta ni las páginas puedan leer datos de otro usuario. Incluye la configuración inicial de `bun test` (no existe ningún test en el repo) y tests del repositorio contra el Postgres local.

## 🎯 Scope
### In Scope
- `src/server/chat/conversations.ts` con la API de abajo
- `bunfig.toml` con `preload = ["./src/test/setup.ts"]`
- `src/test/setup.ts`: `process.env.SKIP_ENV_VALIDATION = "1"` y `DEEPSEEK_API_KEY` dummy antes de que cualquier módulo importe `~/env`
- `package.json`: script `"test": "bun test"`
- `src/server/chat/conversations.test.ts`

### Out of Scope
- Uso del repositorio desde `/api/chat` (#A-03) o páginas (#A-04)
- Server actions (#B-01)
- Tests de la ruta HTTP (#C-03)

## 🔧 Technical Details
### Implementation Approach
Importar `db` de `~/server/db` y las tablas de `~/server/db/schema`. Cada consulta incluye `eq(conversation.userId, userId)`; para mensajes se hace `innerJoin` o se comprueba primero la propiedad de la conversación. `appendMessage` actualiza `conversation.updatedAt` en la misma transacción. Con `noUncheckedIndexedAccess`, `rows[0]` tras `.returning()` es `T | undefined`: comprobar y lanzar o devolver `null`.

```ts
// src/server/chat/conversations.ts — firma pública
export type Conversation = typeof conversation.$inferSelect;
export type Message = typeof message.$inferSelect;
export type MessageRole = Message["role"];

export function createConversation(userId: string, title?: string): Promise<Conversation>;
export function getConversation(userId: string, id: string): Promise<Conversation | null>;
export function listConversations(userId: string): Promise<Conversation[]>; // updatedAt desc
export function listMessages(userId: string, conversationId: string): Promise<Message[]>; // createdAt asc
export function appendMessage(userId: string, conversationId: string, role: MessageRole, content: string): Promise<Message>; // bumps updatedAt
export function renameConversation(userId: string, id: string, title: string): Promise<Conversation | null>;
export function deleteConversation(userId: string, id: string): Promise<boolean>;
export function updateSystemPrompt(userId: string, id: string, prompt: string | null): Promise<Conversation | null>;
```

```toml
# bunfig.toml
[test]
preload = ["./src/test/setup.ts"]
```

```ts
// src/test/setup.ts
process.env.SKIP_ENV_VALIDATION = "1";
process.env.DEEPSEEK_API_KEY ??= "test-key";
process.env.DATABASE_URL ??=
	"postgresql://postgres:password@localhost:5434/desarrollo-de-software-con-ia";
```

### Dependencies
- **Blocked by**: #A-01
- **Blocks**: #A-03, #A-04, #B-01, #B-02
- **External dependencies**: Postgres local en marcha (`docker compose up -d`), `bun test`

### Interface Definition
```yaml
inputs:
  - userId: string, id del usuario de Better Auth (session.user.id)
  - conversationId / id: string uuid
  - role: "user" | "assistant"
  - content, title, prompt: string
outputs:
  - Conversation | Conversation[] | null: filas tipadas con $inferSelect
  - Message | Message[]
  - boolean: deleteConversation (true si borró una fila del usuario)
```

### Integration Points
- **Receives from**: #A-01 - tablas `conversation`, `message` y tipos inferidos
- **Provides to**: #A-03 (`getConversation`, `createConversation`, `appendMessage`), #A-04 (`getConversation`, `listMessages`), #B-01 (`renameConversation`, `deleteConversation`), #B-02 (`listConversations`), #C-02 (`updateSystemPrompt`)

## ✅ Acceptance Criteria
- [ ] Todas las funciones exigen `userId` y devuelven `null`/`[]`/`false` para conversaciones de otro usuario
- [ ] `appendMessage` actualiza `updatedAt` de la conversación
- [ ] `bun test` ejecuta `conversations.test.ts` en verde y limpia sus filas
- [ ] `bun run typecheck` y `bun run check` en verde
- [ ] Documentación breve en `CLAUDE.md` (sección `src/server/chat/`) — coordinar con #A-01, que también edita `CLAUDE.md` en el tier anterior

## 🧪 Testing Strategy
### Unit Tests
- `createConversation` + `getConversation` devuelven la misma fila
- `getConversation(otroUserId, id)` → `null`
- `listConversations` ordena por `updatedAt desc` tras `appendMessage`
- `deleteConversation` borra en cascada los mensajes

### Integration Tests
- Usuario de prueba insertado directamente en `user` en `beforeAll`, borrado en `afterAll` (cascada limpia el resto)

## 📎 Additional Context
### Related Issues
- Depends on: #A-01
- Related to: #A-03, #A-04, #B-01, #B-02, #C-02

### References
- Drizzle relational queries: https://orm.drizzle.team/docs/rqb
- Bun test preload: https://bun.sh/docs/test/lifecycle#preload

### Technical Notes
- `mock.module` de Bun con el alias `~` puede no aplicar; para los tests de este sub-issue no hace falta mockear nada (se usa la base real).
- No exportar `db` desde este módulo; la ruta y las páginas solo deben importar el repositorio.

## 🏷️ Labels
`sub-issue`, `backend`, `P0`, `story-points:5`

## 📅 Timeline
- **Start**: Tier 1 del epic
- **Target Completion**: en vivo durante la demo
- **Estimated**: 5 story points

## 🤝 Handoff Checklist
- [ ] Interface contract documented
- [ ] Firmas exportadas documentadas arriba
- [ ] Data models/schemas defined (`Conversation`, `Message`, `MessageRole`)
- [ ] Error handling patterns established (`null`/`false` en vez de excepciones para "no encontrado")
- [ ] Integration points validated con #A-03 y #A-04
- [ ] Handoff notes para @backend-architect (#A-03, #B-01) y @frontend-developer (#A-04, #B-02)

**Archivos de propiedad exclusiva en este tier**: `src/server/chat/conversations.ts`, `src/server/chat/conversations.test.ts`, `bunfig.toml`, `src/test/setup.ts`, `package.json`
