---
id: "C-01"
title: "[Sub-issue] Rate limit por usuario en /api/chat (429 + Retry-After)"
labels: ["sub-issue", "backend", "P2", "story-points:3"]
story_points: 3
assignee: "security-auditor"
priority: "P2"
epic: "EPIC-C"
dependencies: ["01-01"]
---

# [Sub-issue] Rate limit por usuario en /api/chat (429 + Retry-After)

## 🔗 Parent Issue
Part of #EPIC-C - System prompt por conversación, rate limit y tests

## 👤 Assignment
**Assigned Agent/Team Member**: @security-auditor
**Specialization**: security-auditor
**Story Points**: 3

## 🛠️ Skills & Tooling
**Claude Code Skills**: standalone
**Custom Skill Needed**: No
**Skill Usage**: Standalone

## 📋 Summary
Limitar las peticiones a `POST /api/chat` por usuario autenticado con una ventana deslizante de un minuto. El límite se configura con `CHAT_RATE_LIMIT_PER_MINUTE` (default 20). Al superarlo la ruta responde `429 { error: "Rate limited" }` con cabecera `Retry-After` y **no** llama a DeepSeek.

## 🎯 Scope
### In Scope
- Archivo nuevo (propiedad exclusiva): `src/server/ai/rate-limit.ts`.
  - `checkRateLimit(userId: string, now = Date.now()): { allowed: true } | { allowed: false, retryAfterSeconds: number }`.
  - Almacén `Map<string, number[]>` (timestamps) cacheado en `globalThis` fuera de producción, siguiendo el patrón de `src/server/db/index.ts` para sobrevivir a HMR.
  - Poda de timestamps fuera de la ventana en cada llamada; limpieza perezosa de usuarios sin actividad.
- `src/env.js`: `CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20)` en `server` y `runtimeEnv`; `.env.example` con la clave comentada.
- `src/app/api/chat/route.ts`: llamar a `checkRateLimit(session.user.id)` inmediatamente después del guard de sesión y antes de validar el body o crear el stream.

### Out of Scope
- Rate limit distribuido (Redis) — fuera del alcance del workshop; documentar como limitación.
- Tests (→ #C-03).

## 🔧 Technical Details
### Implementation Approach
- Ventana: 60 000 ms. `retryAfterSeconds = Math.ceil((oldest + 60000 - now) / 1000)`.
- Respuesta 429: `Response.json({ error: "Rate limited" }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } })`.
- No registrar `userId` ni contenido en logs.
- Importar `env` desde `~/env`, nunca `process.env`.

### Dependencies
- **Blocked by**: #01-01
- **Blocks**: #C-03
- **External dependencies**: ninguna

### Interface Definition
```yaml
inputs:
  - checkRateLimit(userId: string, now?: number)
  - env.CHAT_RATE_LIMIT_PER_MINUTE: number (default 20)
outputs:
  - { allowed: true } | { allowed: false, retryAfterSeconds: number }
  - HTTP 429 { error: "Rate limited" } + Retry-After en /api/chat
```

### Integration Points
- **Receives from**: #01-01 - `route.ts` y el orden guard → validación → stream.
- **Provides to**: #C-03 - función pura testeable inyectando `now`.

## ✅ Acceptance Criteria
- [ ] La petición 21 en un minuto devuelve `429` con `Retry-After` correcto.
- [ ] Tras expirar la ventana, vuelve a permitir peticiones.
- [ ] Un usuario limitado no afecta a otro.
- [ ] Con `CHAT_RATE_LIMIT_PER_MINUTE=1` en `.env` el comportamiento se comprueba con dos `curl` seguidos.
- [ ] Sin llamadas a DeepSeek cuando se rechaza (verificable mockeando en #C-03).
- [ ] `bun run typecheck && bun run check` en verde.

## 🧪 Testing Strategy
### Unit Tests
- `rate-limit.test.ts` (→ #C-03): límite exacto, expiración, aislamiento por usuario, `retryAfterSeconds`.

### Integration Tests
- Route handler con sesión mockeada devolviendo 429 (→ #C-03).

## 📎 Additional Context
### Related Issues
- Depends on: #01-01
- Related to: #C-03

### References
- Patrón `globalThis` cache: `src/server/db/index.ts`

### Technical Notes
_El `Map` vive por proceso; en despliegues multi-instancia el límite es por instancia. Aceptado para el workshop._

## 🏷️ Labels
`sub-issue`, `backend`, `P2`, `story-points:3`

## 📅 Timeline
- **Start**: tier 0 de #EPIC-C
- **Target Completion**: mismo tier
- **Estimated**: 3 story points

## 🤝 Handoff Checklist
- [ ] Firma de `checkRateLimit` documentada
- [ ] Variable de entorno en `src/env.js` y `.env.example`
- [ ] Orden de comprobación en `route.ts` documentado en la PR
- [ ] Limitación por instancia anotada
- [ ] Notas de handoff para #C-03
