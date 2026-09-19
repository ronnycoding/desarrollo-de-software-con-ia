---
id: "C-03"
title: "[Sub-issue] Tests: chat-schema, rate-limit y route handler con DeepSeek mockeado"
labels: ["sub-issue", "testing", "P2", "story-points:5"]
story_points: 5
assignee: "test-automator"
priority: "P2"
epic: "EPIC-C"
dependencies: ["C-01", "C-02"]
---

# [Sub-issue] Tests: chat-schema, rate-limit y route handler con DeepSeek mockeado

## 🔗 Parent Issue
Part of #EPIC-C - System prompt por conversación, rate limit y tests

## 👤 Assignment
**Assigned Agent/Team Member**: @test-automator
**Specialization**: test-automator
**Story Points**: 5

## 🛠️ Skills & Tooling
**Claude Code Skills**: standalone
**Custom Skill Needed**: No
**Skill Usage**: Standalone

## 📋 Summary
Cubrir con `bun test` las piezas puras y el route handler del chat sin tocar DeepSeek ni requerir sesión real: tests unitarios de `chat-schema.ts` y `rate-limit.ts`, y tests del handler `POST /api/chat` con `mock.module` para `~/server/ai/deepseek` y `~/server/better-auth/server`. El setup de `bun test` (`bunfig.toml`, `src/test/setup.ts`) proviene de #A-02.

## 🎯 Scope
### In Scope
- Archivos nuevos (propiedad exclusiva):
  - `src/server/ai/chat-schema.test.ts` — válido; vacío; >50 mensajes; último rol `assistant`; `conversationId` no uuid.
  - `src/server/ai/rate-limit.test.ts` — límite exacto con `now` inyectado; expiración de ventana; aislamiento por usuario; `retryAfterSeconds`.
  - `src/app/api/chat/route.test.ts` — casos: sin sesión → 401; body inválido → 400; sesión OK → 200 `text/plain` cuyo body concatenado es el texto mockeado; límite superado → 429 y el mock de DeepSeek **no** se invoca; conversación con `systemPrompt` → el mock recibe `system` igual al guardado.
- Mock del cliente: objeto con `messages.stream()` que devuelve un async iterable de eventos `content_block_delta/text_delta` más `finalMessage()`.
- Script `"test": "bun test"` en `package.json` si #A-02 no lo añadió.

### Out of Scope
- Tests E2E de UI (se hacen con Chrome MCP en `/merge-and-test`).
- Tests del repositorio contra Postgres (→ #A-02).

## 🔧 Technical Details
### Implementation Approach
- `src/test/setup.ts` debe fijar `process.env.SKIP_ENV_VALIDATION = "1"` y `DEEPSEEK_API_KEY = "test"` antes de cualquier import de `~/env`.
- `mock.module` con el alias `~` puede no aplicarse; si falla, mockear por ruta relativa resuelta (`../../server/ai/deepseek`) y anotarlo en la PR.
- Construir `Request` con `new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(...), headers: { "content-type": "application/json" } })` y llamar a `POST(req)` directamente.
- Leer el stream con `await res.text()`.
- Para persistencia (#A-03), mockear también `~/server/chat/conversations` para no requerir DB.

### Dependencies
- **Blocked by**: #C-01, #C-02
- **Blocks**: ninguno
- **External dependencies**: `bun:test`

### Interface Definition
```yaml
inputs:
  - POST(req: Request) de src/app/api/chat/route.ts
  - chatRequestSchema de src/server/ai/chat-schema.ts
  - checkRateLimit(userId, now) de src/server/ai/rate-limit.ts
outputs:
  - suite bun test en verde; script "test" en package.json
```

### Integration Points
- **Receives from**: #C-01 - función pura con `now` inyectable; #C-02 - `system` derivado de la conversación; #A-02 - setup de bun test.
- **Provides to**: `/merge-and-test` - suite automatizada previa a los tests de navegador.

## ✅ Acceptance Criteria
- [ ] `bun test` pasa en local sin Postgres ni `DEEPSEEK_API_KEY` real para los tests de este sub-issue.
- [ ] Cobertura de los cinco casos del handler y de todos los casos de schema y rate-limit listados.
- [ ] El mock de DeepSeek registra las llamadas y permite afirmar "no invocado" en 401/400/429.
- [ ] `bun run typecheck && bun run check` en verde (tests incluidos en el tsconfig).

## 🧪 Testing Strategy
### Unit Tests
- Los descritos en In Scope.

### Integration Tests
- Handler completo con mocks; no se prueba red.

## 📎 Additional Context
### Related Issues
- Depends on: #C-01, #C-02
- Related to: #A-02, #A-03

### References
- Bun test: https://bun.sh/docs/cli/test
- `mock.module`: https://bun.sh/docs/test/mocks

### Technical Notes
_Si `mock.module` no intercepta el alias `~`, no perder tiempo: usar la ruta relativa y documentarlo._

## 🏷️ Labels
`sub-issue`, `testing`, `P2`, `story-points:5`

## 📅 Timeline
- **Start**: tier 1 de #EPIC-C
- **Target Completion**: mismo tier
- **Estimated**: 5 story points

## 🤝 Handoff Checklist
- [ ] Script `test` documentado en `CLAUDE.md` (sección Commands)
- [ ] Mock de DeepSeek reutilizable exportado desde `src/test/`
- [ ] Casos cubiertos listados en la PR
- [ ] Limitaciones (alias `~`) anotadas
- [ ] Sin dependencias de red ni DB
