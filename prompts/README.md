# Prompts del workshop — Chatbot con DeepSeek

Todo lo que el presentador pega en Claude Code durante la sesión de 45 min. Cada archivo corresponde a una demo del deck (`desarrollo-de-software-con-ia.pdf`) y produce, paso a paso, un chatbot autenticado sobre **DeepSeek vía su API compatible con Anthropic**.

| Archivo                                        | Metodología               | Comandos                                                   | Tiempo demo  |
| ---------------------------------------------- | ------------------------- | ---------------------------------------------------------- | ------------ |
| [`00-planificacion.md`](./00-planificacion.md) | Antes de la primera línea | `/architecture`, `/mvp-requirements`                       | pre-workshop |
| [`01-issue-driven.md`](./01-issue-driven.md)   | Individual · Issue-Driven | `/issue` → `/task` → `/pr` → `/code-review`                | 5 min        |
| [`02-bdd.md`](./02-bdd.md)                     | Behavioral · BDD          | `/user-story` → `/issue` → `/task`                         | 5 min        |
| [`03-epic-driven.md`](./03-epic-driven.md)     | Scaled · Epic-Driven      | `/work-on-opens` → `git worktree list` → `/merge-and-test` | 7 min        |

Los issues de referencia (epic padre, epics A/B/C y 13 sub-issues) viven en [`../issues/`](../issues/). Son la fuente de verdad; `scripts/publish-epics.sh` los publica en GitHub cuando la demo 3 lo necesita.

## Prerrequisitos (una sola vez)

```bash
# 1. Configuración de Claude Code del workshop
git clone --recurse-submodules git@github.com:ronnycoding/.claude.git ~/.claude

# 2. Clave de DeepSeek (https://platform.deepseek.com/api_keys)
cat >> .env <<'ENV'
DEEPSEEK_API_KEY="sk-..."
DEEPSEEK_BASE_URL="https://api.deepseek.com/anthropic"
DEEPSEEK_MODEL="deepseek-flash"
ENV

# 3. Base de datos y deps
docker compose up -d
bun install
bun run db:push

# 4. Agent teams (solo demo 3)
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# 5. gh autenticado con scope project (ya lo tiene si `gh auth status` lista 'project')
gh auth status
```

## Qué pre-ejecutar antes del workshop

Recomendado:

1. **Antes**: correr `01-issue-driven.md` y `02-bdd.md` completos y mergear ambos PRs a `main`. En vivo se muestran los issues/PRs ya creados y se relanza solo el paso que se quiera enseñar (p. ej. `/task` sobre el sub-issue ya existente en una rama limpia).
2. **Antes**: `bash prompts/scripts/publish-epics.sh` para publicar epics A/B/C y sus sub-issues en el board #8.
3. **En vivo**: `03-epic-driven.md` solo con Epic A (tier 0 + tier 1, dos worktrees). Mientras los agentes trabajan, mostrar `git worktree list`.

## Contrato técnico compartido (resumen)

- `POST /api/chat` → body `{ messages: {role, content}[], conversationId? }` → `200 text/plain` streameado, header `X-Conversation-Id`; errores JSON 400/401/404/429/502.
- Cliente: `@anthropic-ai/sdk` con `baseURL: env.DEEPSEEK_BASE_URL`, modelo `env.DEEPSEEK_MODEL`. Solo `model`, `max_tokens`, `system`, `messages`, `temperature`. DeepSeek **no** acepta `top_k`, `thinking`, `output_config`, `cache_control`, `betas` ni `mcp_servers`.
- Auth: `getSession()` de `src/server/better-auth/server.ts` antes de abrir el stream.
- Docs: <https://api-docs.deepseek.com/guides/anthropic_api>

## Riesgos conocidos

- **Worktrees vacíos**: `.worktrees/*` no tienen `.env` ni `node_modules`. Copiar `.env` y correr `bun install` en cada uno o la validación de env falla.
- **Postgres compartido**: todos los worktrees usan la misma DB. Mergear Epic A (schema) antes de arrancar Epic B.
- **Cookies Better Auth**: solo same-origin. Cada worktree se prueba contra su propio `bun dev`.
- **`/merge-and-test`** asume `pnpm dev` en `:3333`; este proyecto es `bun dev` en `:3000`. El prompt lo indica explícitamente.
- **DeepSeek 400**: cualquier parámetro no soportado devuelve 400 inmediato. `max_tokens` inicial 4096.
