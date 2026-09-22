# API Layer & Integrations

**Domain:** API / LLM Integration
**Primary Technology:** Next.js Route Handlers + `@anthropic-ai/sdk` → DeepSeek
**Last Updated:** 2026-09-19

---

## Superficie de API

| Endpoint | Método | Auth | Descripción |
| -------- | ------ | ---- | ----------- |
| `/api/chat` | POST | sesión Better Auth | chat con respuesta streameada |
| `/api/auth/[...all]` | GET/POST | — | handler catch-all de Better Auth (sign in/up/out, sesión) |

No hay versionado en la URL. El contrato de `/api/chat` se congela en #01-01 y solo se extiende de forma **aditiva**: #A-03 añade el header `X-Conversation-Id` y el status 404; #C-01 añade el 429. Ningún slice cambia un campo existente.

Todo lo demás (rename, delete, system prompt) son **server actions**, no endpoints HTTP. Ver [backend.md](./backend.md).

---

## Contrato: `POST /api/chat`

### Request

```http
POST /api/chat HTTP/1.1
Content-Type: application/json
Cookie: better-auth.session_token=<token>
```

```json
{
  "messages": [
    { "role": "user", "content": "Explícame el streaming en React 19" }
  ],
  "conversationId": "3f1c9c84-0b3e-4b1e-9a3a-6a5b7c8d9e0f"
}
```

**Reglas de validación (`chatRequestSchema`, zod):**

| Campo | Regla |
| ----- | ----- |
| `messages` | array de 1 a 50 elementos, requerido |
| `messages[].role` | `"user"` \| `"assistant"` |
| `messages[].content` | string de 1 a 8000 caracteres |
| última posición | debe tener `role: "user"` |
| `conversationId` | uuid, **opcional**. Ignorado en #01-01; a partir de #A-03 selecciona la conversación |

`chat-schema.ts` importa **solo** `zod`, de modo que un client component puede importar el tipo `ChatMessage` sin arrastrar código de servidor.

### Responses

| Status | Body | Headers |
| ------ | ---- | ------- |
| **200** | texto del asistente streameado (deltas concatenados, sin framing) | `Content-Type: text/plain; charset=utf-8`<br>`Cache-Control: no-cache, no-transform`<br>`X-Accel-Buffering: no`<br>`X-Conversation-Id: <uuid>` |
| **400** | `{ "error": "Invalid request", "issues": ZodIssue[] }` | — |
| **401** | `{ "error": "Unauthorized" }` | — |
| **404** | `{ "error": "Conversation not found" }` | — |
| **429** | `{ "error": "Rate limited" }` | `Retry-After: <segundos>` |
| **502** | `{ "error": "Upstream error" }` | — |

**Por qué esos headers:**
- `Cache-Control: no-cache, no-transform` evita que un intermediario reescriba o comprima el cuerpo (la compresión rompe la entrega incremental).
- `X-Accel-Buffering: no` desactiva el buffering de nginx y proxies compatibles; sin él la respuesta llega de golpe al final.
- `X-Conversation-Id` es la única vía para devolver metadatos: el body es texto plano y no admite un sobre JSON.

**Semántica de errores:**
- El 401 se devuelve **antes** de cualquier llamada upstream: una petición anónima nunca gasta tokens.
- Una conversación ajena devuelve **404, no 403**, para no revelar que el id existe.
- Un fallo a mitad de stream no puede cambiar el status (ya se envió el 200): el servidor llama a `controller.error(err)` y el cliente ve la conexión cortarse. El texto parcial ya persistido se conserva.

### Cancelación

El cliente aborta con `AbortController`; el servidor recibe `req.signal`, y el `cancel()` del `ReadableStream` llama a `stream.abort()`. A partir de #A-03 el texto parcial acumulado se persiste como mensaje del asistente.

---

## Ejemplos con `curl`

```bash
# 401 — sin sesión
curl -N -X POST localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"hi"}]}'

# 200 — streaming (cookie copiada de DevTools tras iniciar sesión en /)
curl -N -X POST localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -H 'cookie: better-auth.session_token=<token>' \
  -d '{"messages":[{"role":"user","content":"cuenta hasta 20 despacio"}]}'

# 400 — último mensaje con role assistant
curl -s -X POST localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -H 'cookie: better-auth.session_token=<token>' \
  -d '{"messages":[{"role":"assistant","content":"hola"}]}' | jq

# Verificar headers de streaming
curl -v -N -X POST localhost:3000/api/chat ... 2>&1 | grep -iE 'cache-control|x-accel|x-conversation'
```

`-N` desactiva el buffering de curl: sin esa bandera, el streaming parece no funcionar aunque funcione.

---

## Integración con DeepSeek

### Cliente

```ts
// src/server/ai/deepseek.ts
import Anthropic from "@anthropic-ai/sdk";
import { env } from "~/env";

export const deepseek = new Anthropic({
	apiKey: env.DEEPSEEK_API_KEY,
	baseURL: env.DEEPSEEK_BASE_URL, // https://api.deepseek.com/anthropic
});
export const DEEPSEEK_MODEL = env.DEEPSEEK_MODEL; // deepseek-flash
export const DEFAULT_MAX_TOKENS = 4096;
```

Pasar `apiKey` y `baseURL` **explícitos**: por defecto el SDK lee `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` del entorno y la petición acabaría en otro proveedor.

### Parámetros

| Parámetro | Estado | Notas |
| --------- | ------ | ----- |
| `model` | ✅ soportado | `deepseek-flash` por defecto; DeepSeek mapea automáticamente nombres `claude-*` |
| `max_tokens` | ✅ soportado | 4096 inicial; por encima del tope del modelo devuelve 400 |
| `system` | ✅ soportado | string plano. **Sin** bloques con `cache_control` |
| `messages` | ✅ soportado | `Anthropic.MessageParam[]`, roles alternando, último `user` |
| `temperature` | ✅ soportado | rango 0–2 |
| `stream` | ✅ soportado | vía `messages.stream()` |
| `stop_sequences` | ✅ soportado | no se usa en el MVP |
| `tool_use` | ✅ soportado | fuera de alcance del MVP |
| `metadata.user_id` | ⚠️ parcial | no se envía |
| `thinking` | ⚠️ parcial | sin `budget_tokens`. **No usar** |
| `top_p` | ⚠️ parcial | solo con thinking. **No usar** |
| `top_k` | ❌ no soportado | 400 |
| `output_config` | ❌ no soportado | 400 |
| `cache_control` | ❌ no soportado | 400 |
| `betas` | ❌ no soportado | 400 |
| `fallbacks` | ❌ no soportado | 400 |
| `mcp_servers` | ❌ no soportado | 400 |
| `document` / `search_result` / `code_execution` | ❌ no soportado | 400 |

> **Regla de revisión:** cualquier PR que añada un parámetro a `deepseek.messages.stream()` necesita justificarlo contra esta tabla. El endpoint devuelve 400 ante campos desconocidos, sin degradación elegante.

### Llamada canónica

```ts
const stream = deepseek.messages.stream(
	{
		model: DEEPSEEK_MODEL,
		max_tokens: DEFAULT_MAX_TOKENS,
		system: conversation.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
		messages, // Anthropic.MessageParam[]
	},
	{ signal: req.signal },
);
```

### Eventos consumidos

| Evento | Acción |
| ------ | ------ |
| `content_block_delta` con `delta.type === "text_delta"` | encolar `delta.text` codificado |
| resto de eventos | ignorados |
| `await stream.finalMessage()` | concatenar bloques `text` y persistir el mensaje del asistente; leer `usage.output_tokens` para el log |

### Errores del upstream

| Error | Tratamiento |
| ----- | ----------- |
| `Anthropic.APIError` antes del primer byte | 502 `{ error: "Upstream error" }`, sin detalles del proveedor |
| 400 por parámetro no soportado | revisar contra la tabla de arriba |
| 404 de modelo | cambiar `DEEPSEEK_MODEL` en `.env`, sin tocar código |
| Error a mitad de stream | `controller.error(err)` |

Nunca se reenvía el mensaje crudo del upstream al cliente: puede incluir detalles de cuenta o de la clave.

---

## Portabilidad de proveedor

Cambiar de DeepSeek a Anthropic real (u otro endpoint compatible) es cambiar dos variables de entorno:

```env
DEEPSEEK_BASE_URL="https://api.anthropic.com"
DEEPSEEK_MODEL="claude-..."
```

Ningún archivo de código cambia. Esa es la razón de que `baseURL` y `model` vivan en `src/env.js` y no como literales.

---

## Servicios externos

| Servicio | Propósito | Proveedor | Documentación |
| -------- | --------- | --------- | ------------- |
| DeepSeek (Anthropic-compatible) | inferencia del modelo | DeepSeek | https://api-docs.deepseek.com/guides/anthropic_api |

No hay pagos, email, almacenamiento de objetos, CDN ni colas en el MVP.

---

## Skill recomendada

`deepseek-anthropic-compat` (ver el epic padre): skill de dominio que documente modelos, parámetros soportados / parciales / no soportados de este endpoint. Evita 400 por parámetros desconocidos y sirve de checklist para `/code-review`. Crear con `create-skill`.

---

## Interconnections

- **← Frontend:** consume el stream con `getReader()`; ver [frontend.md](./frontend.md)
- **← Backend:** implementación del handler; ver [backend.md](./backend.md)
- **← Authentication:** guard `getSession()`; ver [authentication.md](./authentication.md)
- **→ Database:** persistencia de mensajes; ver [database.md](./database.md)

---

**Maintained by:** @backend-architect (apoyo @ai-engineer)
**Review cycle:** cada cambio del contrato
