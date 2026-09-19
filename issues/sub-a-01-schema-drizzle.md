---
id: "A-01"
title: "[Sub-issue] Schema Drizzle conversation/message + fix tablesFilter"
labels: ["sub-issue", "database", "P0", "story-points:3"]
story_points: 3
assignee: "database-optimizer"
priority: "P0"
epic: "EPIC-A"
dependencies: ["01-01"]
---

# [SUB-ISSUE] Schema Drizzle conversation/message + fix tablesFilter

## 🔗 Parent Issue
Part of #EPIC-A - Persistencia de conversaciones y mensajes

## 👤 Assignment
**Assigned Agent/Team Member**: @database-optimizer
**Specialization**: database-optimizer
**Story Points**: 3

## 🛠️ Skills & Tooling
**Claude Code Skills**: standalone (agente solo)
**Custom Skill Needed**: No
**Skill Usage**: Standalone

## 📋 Summary
Añadir las tablas `conversation` y `message` a `src/server/db/schema.ts` usando el helper `createTable` existente (prefijo `pg-drizzle_`), corregir el `tablesFilter` de `drizzle.config.ts` para que drizzle-kit vea las tablas del proyecto, y actualizar el gotcha documentado en `CLAUDE.md`.

## 🎯 Scope
### In Scope
- Tablas `conversation` y `message` con índices y `relations()`
- `drizzle.config.ts`: `tablesFilter` que cubra `pg-drizzle_*` y las tablas de Better Auth
- `CLAUDE.md`: reemplazar la sección "Known gotcha: table prefix mismatch" por el estado real
- Verificar con `bun run db:push` contra el Postgres de `docker compose`

### Out of Scope
- Funciones de acceso a datos (#A-02)
- Cambios en `/api/chat` o en la UI (#A-03, #A-04)
- Migraciones SQL versionadas (`db:generate`); en dev se usa `db:push`

## 🔧 Technical Details
### Implementation Approach
Seguir el estilo de columnas `(d) => ({...})` de la tabla `posts`. `userId` es `text` para coincidir exactamente con `user.id` (la columna `posts.createdById` es `varchar(255)`, inconsistente; no tocarla). `role` se tipa como `text({ enum })` para evitar un `pgEnum` sin prefijo. La columna `systemPrompt` se crea ya aquí para que #C-02 no necesite una segunda migración.

```ts
// src/server/db/schema.ts (añadir tras `posts`)
export const conversation = createTable(
	"conversation",
	(d) => ({
		id: d.uuid().primaryKey().defaultRandom(),
		userId: d
			.text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: d.varchar({ length: 120 }).notNull().default("New conversation"),
		systemPrompt: d.text(),
		createdAt: d
			.timestamp({ withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: d
			.timestamp({ withTimezone: true })
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date())
			.notNull(),
	}),
	(t) => [index("conversation_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const message = createTable(
	"message",
	(d) => ({
		id: d.uuid().primaryKey().defaultRandom(),
		conversationId: d
			.uuid()
			.notNull()
			.references(() => conversation.id, { onDelete: "cascade" }),
		role: d.text({ enum: ["user", "assistant"] }).notNull(),
		content: d.text().notNull(),
		createdAt: d
			.timestamp({ withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
	}),
	(t) => [
		index("message_conversation_created_idx").on(t.conversationId, t.createdAt),
	],
);

export const conversationRelations = relations(conversation, ({ one, many }) => ({
	user: one(user, { fields: [conversation.userId], references: [user.id] }),
	messages: many(message),
}));

export const messageRelations = relations(message, ({ one }) => ({
	conversation: one(conversation, {
		fields: [message.conversationId],
		references: [conversation.id],
	}),
}));
```

Añadir `conversations: many(conversation)` a `userRelations`.

```ts
// drizzle.config.ts
tablesFilter: ["pg-drizzle_*", "user", "session", "account", "verification"],
```

Los nombres de índice son globales en Postgres y `pgTableCreator` no los prefija; de ahí los nombres descriptivos.

### Dependencies
- **Blocked by**: #01-01
- **Blocks**: #A-02
- **External dependencies**: `drizzle-orm` 0.41, `drizzle-kit` 0.30, Postgres 17 (`docker compose up -d`)

### Interface Definition
```yaml
inputs:
  - schema.ts existente: tablas user/session/account/verification y helper createTable
outputs:
  - conversation: tabla pg-drizzle_conversation (id uuid, userId text FK user.id cascade, title varchar(120), systemPrompt text|null, createdAt, updatedAt)
  - message: tabla pg-drizzle_message (id uuid, conversationId uuid FK cascade, role 'user'|'assistant', content text, createdAt)
  - conversationRelations, messageRelations: relations() exportadas
  - drizzle.config.ts: tablesFilter que incluye todas las tablas del proyecto
```

### Integration Points
- **Receives from**: #01-01 - `.env` con `DEEPSEEK_API_KEY` (necesaria porque `drizzle.config.ts` importa `~/env`; alternativa `SKIP_ENV_VALIDATION=1`)
- **Provides to**: #A-02 - tipos `typeof conversation.$inferSelect` / `typeof message.$inferSelect` y tablas para el repositorio

## ✅ Acceptance Criteria
- [ ] `bun run db:push` crea `pg-drizzle_conversation` y `pg-drizzle_message` y no propone borrar ninguna tabla existente
- [ ] `\d "pg-drizzle_message"` muestra FK con `ON DELETE CASCADE` hacia `pg-drizzle_conversation`
- [ ] `bun run typecheck` y `bun run check` en verde
- [ ] `CLAUDE.md` ya no describe el gotcha como pendiente
- [ ] Interface contract validado por #A-02

## 🧪 Testing Strategy
### Unit Tests
- No aplica (solo schema). La validación es `db:push` + inspección con `psql` o `bun run db:studio`.

### Integration Tests
- Insertar un `user`, una `conversation` y dos `message` con `psql`; borrar el `user` y comprobar que cascada elimina ambos.

## 📎 Additional Context
### Related Issues
- Depends on: #01-01
- Related to: #A-02, #C-02

### References
- `CLAUDE.md` sección "Known gotcha: table prefix mismatch"
- https://orm.drizzle.team/docs/goodies#multi-project-schema

### Technical Notes
- Nunca eliminar `tablesFilter` por completo en una base compartida: `db:push` propondría borrar tablas desconocidas.
- Postgres es compartido entre worktrees; este sub-issue va solo en Tier 0.

## 🏷️ Labels
`sub-issue`, `database`, `P0`, `story-points:3`

## 📅 Timeline
- **Start**: Tier 0 del epic
- **Target Completion**: en vivo durante la demo
- **Estimated**: 3 story points

## 🤝 Handoff Checklist
- [ ] Interface contract documented
- [ ] Tablas y columnas documentadas en `CLAUDE.md`
- [ ] Data models/schemas defined
- [ ] Error handling patterns established (cascadas)
- [ ] Integration points validated (`db:push` limpio)
- [ ] Handoff notes para @backend-architect (#A-02)

**Archivos de propiedad exclusiva en este tier**: `src/server/db/schema.ts`, `drizzle.config.ts`, `CLAUDE.md`
