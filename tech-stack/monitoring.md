# Monitoring & Observability

**Domain:** Observability
**Scope:** mínimo de MVP — fuera del alcance funcional, documentado para no improvisar
**Last Updated:** 2026-09-19

---

## Posición

La observabilidad **no forma parte del MVP**. No hay APM, ni tracing distribuido, ni agregación de logs, ni alerting. La app corre en local y los logs van a la consola de `bun dev`.

Lo que sí se exige desde el primer slice es un mínimo disciplinado: logs útiles, sin secretos, y una métrica de consumo del modelo.

---

## Logging

| Aspecto | Decisión |
| ------- | -------- |
| Destino | stdout del proceso (`bun dev`) |
| Formato | `console.*` con mensajes cortos y prefijo de módulo |
| Niveles | `console.error` para fallos, `console.warn` para degradaciones, `console.info` para eventos de negocio |
| Retención | ninguna; la consola de la sesión |

### Qué se registra

| Evento | Nivel | Contenido |
| ------ | ----- | --------- |
| Respuesta completada | info | `conversationId`, `usage.output_tokens` de `finalMessage()`, duración |
| `Anthropic.APIError` | error | `status` y `name` del error del SDK |
| Fallo a mitad de stream | error | tipo de error y `conversationId` |
| Rate limit disparado | — | **no se registra** (evita construir un perfil de actividad por usuario) |

### Qué NO se registra nunca

- `DEEPSEEK_API_KEY`, `BETTER_AUTH_SECRET` ni ninguna otra variable secreta
- El contenido de los mensajes del usuario o del asistente
- El `userId` asociado al rate limit
- Headers de la petición (contienen la cookie de sesión)

Un `console.log(req.headers)` de depuración filtra la sesión completa: no debe llegar a un commit.

---

## Métrica principal del MVP

**`usage.output_tokens`** obtenido de `await stream.finalMessage()`. Es la única métrica de coste disponible, y se registra por respuesta completada.

Con ella se responde a lo que importa en el workshop: cuánto cuesta una conversación y cómo crece el coste a medida que el historial se alarga (cada petición reenvía el historial completo).

---

## Objetivos de rendimiento

| Métrica | Objetivo | Cómo se mide en el MVP |
| ------- | -------- | ---------------------- |
| Tiempo al primer token | < 2 s con `deepseek-flash` | percepción directa + `curl -N` |
| Errores de tipo/lint | 0 | `bun run typecheck` y `bun run check` |
| Tests | en verde | `bun test` |

Sin SLO formales ni error budget: no hay producción que proteger.

---

## Health checks

| Componente | Check |
| ---------- | ----- |
| Postgres | healthcheck `pg_isready` en `docker-compose.yml`; `docker compose ps` |
| App | `bun dev` arranca y `src/env.js` valida el entorno (fallo rápido y explícito si falta una variable) |
| DeepSeek | primera petición real; un 401/404 del upstream se manifiesta como 502 |

No hay endpoint `/api/health` en el MVP.

---

## Debugging durante el workshop

```bash
# ¿llegan los chunks progresivamente?
curl -N -X POST localhost:3000/api/chat -H 'content-type: application/json' \
  -H 'cookie: better-auth.session_token=<token>' \
  -d '{"messages":[{"role":"user","content":"cuenta hasta 20 despacio"}]}'

# ¿están los headers anti-buffering?
curl -v -N ... 2>&1 | grep -iE 'cache-control|x-accel|x-conversation'

# estado de la base
docker compose ps
bun run db:studio

# logs de Postgres
docker compose logs -f postgres
```

---

## Evolución (fuera del MVP)

Si el proyecto saliera de local, el orden razonable sería:

1. **Logs estructurados** — sustituir `console.*` por `pino` con JSON y un `requestId` por petición.
2. **Errores de cliente** — Sentry en el error boundary de React y en el `catch` del loop de streaming.
3. **Tracing** — OpenTelemetry alrededor del route handler, con spans para: guard de sesión, consultas al repositorio y llamada al LLM. El span del LLM es el que explica la latencia percibida.
4. **Métricas** — contadores por status (200/400/401/404/429/502), histograma de tiempo al primer token, suma de `output_tokens` por usuario.
5. **Alerting** — solo cuando exista un entorno con usuarios reales; antes, ruido.

Ninguno de estos pasos requiere cambiar el contrato de `/api/chat`: se instrumenta alrededor.

---

## Interconnections

- **← Backend:** punto de instrumentación (`finalMessage()`, manejo de errores); ver [backend.md](./backend.md)
- **← Infrastructure:** destino de los logs y healthcheck de Postgres; ver [infrastructure.md](./infrastructure.md)
- **← Authentication:** reglas sobre qué no registrar; ver [authentication.md](./authentication.md)

---

**Maintained by:** @ronnycoding
**Review cycle:** cuando exista un entorno desplegado
