# 00 · Planificación — antes de la primera línea de código

> Deck, pág. 30: "Dos comandos preparan el terreno para cualquiera de las tres metodologías."

Ambos comandos hacen preguntas con `AskUserQuestion`. Las respuestas preparadas están debajo de cada prompt para no improvisar en vivo. Salida: `tech-stack/` y `mvp-requirements.md` en la raíz, que `/issue` y `/user-story` leen como contexto.

---

## 1. `/architecture` — stack, dominios y conexiones

Pegar en Claude Code:

```
/architecture "Chatbot DeepSeek"
```

### Respuestas preparadas

| Pregunta del comando     | Respuesta                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ¿Cómo quieres la salida? | **Markdown Files** (carpeta `tech-stack/`)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ¿Nombre del proyecto?    | `Chatbot DeepSeek`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ¿Requisitos existentes?  | Sí: `mvp-requirements.md` si ya corriste el paso 2; si no, usar este contexto: *"Chatbot web autenticado (Better Auth email/password) sobre Next.js 15 App Router + React 19, Drizzle/Postgres, Bun, Biome. El LLM es DeepSeek (`deepseek-flash`) consumido con `@anthropic-ai/sdk` apuntando a `https://api.deepseek.com/anthropic`. Streaming de respuestas al navegador, historial de conversaciones por usuario, system prompt por conversación, rate limit por usuario."* |
| Frontend                 | Next.js 15 App Router, React 19, Tailwind v4, componentes cliente solo para el panel de chat                                                                                                                                                                                                                                                                                                                                                                                   |
| Backend                  | Route Handlers (`src/app/api/chat/route.ts`) + Server Actions para CRUD; sin tRPC                                                                                                                                                                                                                                                                                                                                                                                              |
| Base de datos            | Postgres 17 + Drizzle ORM; tablas `conversation`, `message` con prefijo `pg-drizzle_`                                                                                                                                                                                                                                                                                                                                                                                          |
| API / integraciones      | DeepSeek vía Anthropic Messages API (SDK oficial con `baseURL`). Solo `model`, `max_tokens`, `system`, `messages`, `temperature`, `stream`.                                                                                                                                                                                                                                                                                                                                    |
| Autenticación            | Better Auth (ya instalado); `getSession()` en server; cookies same-origin                                                                                                                                                                                                                                                                                                                                                                                                      |
| Infraestructura          | `docker compose` local; despliegue objetivo Vercel o Docker; env validado por `src/env.js`                                                                                                                                                                                                                                                                                                                                                                                     |
| Monitoreo                | Fuera de alcance del MVP; anotar `usage.output_tokens` del `finalMessage()` en logs                                                                                                                                                                                                                                                                                                                                                                                            |
| Mobile                   | No aplica                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Qué mirar en la salida

- `tech-stack/api.md` debe fijar el contrato de `POST /api/chat` (texto plano streameado, `X-Conversation-Id`, errores JSON).
- `tech-stack/diagrams/data-flow.mmd` debe mostrar navegador → route handler → DeepSeek → stream → navegador, y route handler → Postgres.

---

## 2. `/mvp-requirements` — alcance del MVP

Pegar en Claude Code:

```
/mvp-requirements Chatbot web autenticado sobre DeepSeek (API compatible Anthropic) construido con Next.js 15 + Better Auth + Drizzle/Postgres: enviar mensajes y recibir la respuesta en streaming, guardar conversaciones por usuario, sidebar para navegarlas, system prompt configurable y rate limit por usuario
```

### Respuestas preparadas

| Pregunta del comando                  | Respuesta                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ¿Documentación técnica para explorar? | **Proceder sin documentación** (o pasar la URL `https://api-docs.deepseek.com/guides/anthropic_api` si hay NotebookLM configurado) |
| Usuarios objetivo                     | Usuarios registrados con email/contraseña                                                                                          |
| Capacidad núcleo (must)               | Chat con respuesta streameada, autenticación obligatoria                                                                           |
| Capacidades secundarias (should)      | Persistencia de conversaciones, sidebar con renombrar/eliminar                                                                     |
| Capacidades opcionales (could)        | System prompt por conversación, rate limit, tests automatizados                                                                    |
| Fuera de alcance                      | Tool use / function calling, adjuntos, multi-modelo, facturación, compartir conversaciones                                         |
| Restricciones técnicas                | Solo parámetros soportados por DeepSeek; Node runtime (no edge) por `postgres` y Better Auth; Biome estricto                       |
| Métrica de éxito                      | Primer token visible en < 2 s con `deepseek-flash`; 0 errores de tipo/lint en CI                                                   |
| Versión objetivo                      | `v0.1.0` API, `v0.2.0` UI, `v0.3.0` persistencia + sidebar, `v0.4.0` settings/tests                                                |

### Qué mirar en la salida

- `mvp-requirements.md` con la matriz must/should/could que coincide 1:1 con los slices: S1 (API), S2 (UI), Epic A/B/C.
- La sección de restricciones debe listar los parámetros **no** soportados por DeepSeek (`top_k`, `thinking`, `output_config`, `cache_control`, `betas`, `mcp_servers`).
