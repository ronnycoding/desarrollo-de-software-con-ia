# 03 · Epic-Driven Development — un tablero en paralelo

> Deck, pág. 27: `/work-on-opens <board-url>` → `git worktree list` → `/merge-and-test #123`. Qué mirar: un worktree por sub-issue y el orden de merge que reporta al final.

Board: **https://github.com/users/ronnycoding/projects/8** ("Workshop Chatbot DeepSeek", campos `Priority` P0/P1/P2 y `Size`).

Epics (fuente en [`../issues/`](../issues/)):

| Prioridad | Epic | Sub-issues | SP |
|---|---|---|---|
| P0 | Persistencia de conversaciones y mensajes | A-01 schema · A-02 repositorio · A-03 route persiste · A-04 página `/chat/[id]` | 16 |
| P1 | Sidebar con renombrar y eliminar | B-01 server actions · B-02 layout + sidebar · B-03 item | 11 |
| P2 | System prompt, rate limit y tests | C-01 rate limit · C-02 system prompt · C-03 tests | 13 |

Prerrequisitos: slices 1 y 2 mergeados en `main`; `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` exportado.

Tiempo: 7 min en vivo (solo Epic A tier 0 + tier 1).

---

## Paso 0 · Pre-flight (antes del workshop)

```bash
# Publica epics A/B/C + 11 sub-issues en GitHub y los añade al board #8 con su Priority.
# Idempotente: si un issue con el mismo título existe, lo reutiliza.
bash prompts/scripts/publish-epics.sh

# Los worktrees no heredan .env ni node_modules. Preparar un helper:
cat > .worktrees-prepare.sh <<'SH'
for d in .worktrees/*/; do cp .env "$d" 2>/dev/null; (cd "$d" && bun install --silent); done
SH
```

`/work-on-opens` usa `gh issue view`, así que necesita issues reales: los archivos markdown de `issues/` son la fuente de verdad y el script los publica.

---

## Paso 1 · `/work-on-opens` — el board completo

```
/work-on-opens https://github.com/users/ronnycoding/projects/8
```

### Respuestas preparadas

| Pregunta | Respuesta |
|---|---|
| Ready to start working through 3 epics in priority order. Proceed? | **Start from epic #<EPIC-A>** (en vivo) · **Proceed with all** (pre-workshop) |
| Epic involves third-party integrations. Which provider? | **DeepSeek vía Anthropic-compatible API** (ya configurado en `.env`, no requiere clarificación adicional) |
| ¿Continuar al siguiente tier / epic? | **Sí** tras verificar que `bun run check` pasa en cada worktree |

Después de que cree los worktrees (Tier 0 de Epic A = solo A-01; Tier 1 = A-02; Tier 2 = A-03 y A-04 en paralelo), correr en otra terminal:

```bash
bash .worktrees-prepare.sh
```

### Qué mirar

- Fase 3: el grafo de dependencias que imprime:
  ```
  Tier 0: A-01
  Tier 1: A-02
  Tier 2: A-03, A-04   ← paralelo, worktrees distintos
  ```
- Fase 4: `/task` corre en background por sub-issue; los PRs se crean vía `/pr` al completar.
- Fase 5: el **orden de merge recomendado** (A-01 → A-02 → A-03/A-04) y el issue "merge plan" que crea.

---

## Paso 2 · `git worktree list` — mostrar el paralelismo

```bash
git worktree list
```

Salida esperada durante Tier 2:

```
/…/desarrollo-de-software-con-ia                     abc1234 [main]
/…/desarrollo-de-software-con-ia/.worktrees/issue-N  def5678 [issue-N]   # A-03 route persistencia
/…/desarrollo-de-software-con-ia/.worktrees/issue-M  9ab0123 [issue-M]   # A-04 página /chat/[id]
```

Complemento: `gh pr list --state open` para ver los PRs apareciendo.

---

## Paso 3 · `/merge-and-test` — ejecutar el plan de merge

```
/merge-and-test #<merge-plan-issue> — este proyecto arranca con `bun dev` en http://localhost:3000 (no pnpm ni :3333). Antes de probar: `docker compose up -d && bun run db:push`. Usuario de prueba: registrarse en / con email demo@workshop.dev y contraseña workshop123. Escenarios automatizables con Chrome MCP: sign-in, abrir /chat, enviar "hola" y ver streaming, recargar /chat/<id> y ver el historial. Escenarios manuales: verificar el header X-Conversation-Id en DevTools.
```

(`<merge-plan-issue>` = número del issue que `/work-on-opens` reporta al final; si no lo creó, pasar la ruta de un `merge-plan.md` con la lista ordenada de PRs.)

### Qué mirar

- Procesa los PRs **en el orden del plan**; en cada uno hace checkout + merge + pruebas Chrome MCP.
- Crea un issue "Manual Testing" con lo que no pudo automatizar (llamadas reales a DeepSeek con la key).

---

## Epics B y C (fuera de la demo en vivo)

Mergear Epic A antes de arrancarlos (Postgres compartido, B-01/B-02 dependen de A-02 en `main`):

```
/work-on-opens https://github.com/users/ronnycoding/projects/8
→ "Start from epic #<EPIC-B>"
```

---

## Demo comprimida

```bash
bash prompts/scripts/publish-epics.sh        # pre-workshop
/work-on-opens https://github.com/users/ronnycoding/projects/8
git worktree list
/merge-and-test #<merge-plan-issue> — bun dev en :3000
```
