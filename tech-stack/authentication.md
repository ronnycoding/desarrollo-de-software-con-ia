# Authentication & Security

**Domain:** Authentication
**Primary Technology:** Better Auth 1.3 (email/password, cookies)
**Last Updated:** 2026-09-19

---

## Technology Stack

| Pieza | Tecnología | Archivo |
| ----- | ---------- | ------- |
| Instancia | `betterAuth()` con `drizzleAdapter(db, { provider: "pg" })` | `src/server/better-auth/config.ts` |
| Re-export | `auth`, tipo `Session` | `src/server/better-auth/index.ts` |
| Servidor | `getSession()` envuelto en `React.cache` | `src/server/better-auth/server.ts` |
| Cliente | `better-auth/react` | `src/server/better-auth/client.ts` |
| Ruta HTTP | catch-all handler | `src/app/api/auth/[...all]/route.ts` |

**Método:** email + password (`emailAndPassword: { enabled: true }`). Sin OAuth, sin magic links, sin MFA en el MVP.

**Plugin crítico:** `nextCookies()` debe ser **el último** del array `plugins`. Es lo que permite que una server action escriba la cookie de sesión; si se coloca antes que otro plugin, el login "funciona" pero la sesión no persiste.

---

## Modelo de datos

Tablas de Better Auth en `src/server/db/schema.ts`, creadas con `pgTable` **sin prefijo** porque el adaptador espera esos nombres exactos:

| Tabla | Contenido |
| ----- | --------- |
| `user` | `id` (text PK), `name`, `email` (unique), `emailVerified`, `image`, timestamps |
| `session` | `token` (unique), `expiresAt`, `ipAddress`, `userAgent`, `userId` → `user.id` cascade |
| `account` | credenciales: `providerId`, `password` hasheada, tokens OAuth (sin usar), `userId` cascade |
| `verification` | `identifier`, `value`, `expiresAt` |

Cambiar estos nombres de tabla o de columna obliga a reconfigurar el adaptador. Ver [database.md](./database.md).

---

## Flujos

### Sign up / Sign in / Sign out

Implementados como **server actions inline** en `src/app/page.tsx` (patrón a seguir para formularios server-rendered):

```
1. <form action={serverAction}> con "use server" dentro de la action
2. auth.api.signUpEmail / signInEmail / signOut con `headers: await headers()`
3. nextCookies() escribe la cookie de sesión desde la propia action
4. Éxito → redirect("/")
5. Fallo  → redirect("/?error=<mensaje>")
```

No usar el cliente de navegador para autenticar en páginas server-rendered: se perdería el server-side redirect y la cookie tendría que viajar de vuelta.

### Sesión en el servidor

```ts
// src/server/better-auth/server.ts
export const getSession = cache(async () =>
	auth.api.getSession({ headers: await headers() }),
);
```

`React.cache` deduplica la consulta dentro de un mismo request: layout, página y route handler pueden llamarlo sin multiplicar queries.

### Guards por tipo de consumidor

| Consumidor | Sin sesión |
| ---------- | ---------- |
| `/chat`, `/chat/[id]`, `/chat/layout.tsx` | `redirect("/?error=Sign%20in%20to%20chat")` |
| `POST /api/chat` | `401 { "error": "Unauthorized" }` antes de validar el body y antes de cualquier llamada upstream |
| Server actions | `{ ok: false, error: "Unauthorized" }` |

**Orden obligatorio en el route handler:** sesión → rate limit → validación → ownership → stream. Ninguna petición anónima debe llegar a gastar tokens de DeepSeek.

**Regla de runtime:** nunca llamar a `getSession()` ni a `headers()` después de haber empezado a escribir la respuesta.

---

## Autorización

Modelo simple *authenticated / owner*. **No hay roles ni permisos**: RBAC sería complejidad sin caso de uso en el MVP.

La autorización es ownership, y se implementa en la firma de las funciones, no en checks dispersos:

```ts
getConversation(userId, id)   // no existe getConversation(id)
listMessages(userId, id)
appendMessage(userId, id, role, content)
```

Toda consulta incluye `eq(conversation.userId, userId)`. Una conversación ajena devuelve `null`, que la capa HTTP traduce a **404** (no 403): no se revela que el id existe.

`userId` procede siempre de `session.user.id` en el servidor. **Nunca** se acepta un `userId` desde el body o los params.

---

## Cookies y CSRF

- **Cookie:** `better-auth.session_token`, httpOnly, gestionada por `nextCookies()`
- **Scope:** same-origin. `fetch("/api/chat")` la envía por defecto sin configurar `credentials`
- **CORS:** no aplica — no hay clientes de otro origen. No configurar CORS abierto "por si acaso"
- **CSRF:** Next.js valida el origen en server actions; las cookies son same-origin
- **Implicación para worktrees:** cada worktree se prueba contra su propio `bun dev`; una sesión de un puerto no vale para otro

---

## Secretos

| Variable | Alcance | Notas |
| -------- | ------- | ----- |
| `BETTER_AUTH_SECRET` | servidor | opcional en dev, **requerida en producción** (`src/env.js` lo condiciona a `NODE_ENV`) |
| `DEEPSEEK_API_KEY` | servidor | nunca en `console.*`, nunca en la respuesta, nunca con prefijo `NEXT_PUBLIC_` |

Reglas:
- Importar `{ env } from "~/env"`, nunca `process.env` directamente
- `.env` está en `.gitignore`; `.env.example` lleva claves vacías y ningún secreto
- Al copiar `.env` a un worktree, no commitearlo

---

## Rate limiting (defensa de la API)

`checkRateLimit(session.user.id)` se ejecuta inmediatamente después del guard de sesión: la ventana se cuenta por usuario autenticado, no por IP, y la validación del body ocurre después para que un atacante autenticado no pueda forzar trabajo extra.

- Ventana: 60 s · límite: `CHAT_RATE_LIMIT_PER_MINUTE` (default 20)
- Respuesta: `429 { "error": "Rate limited" }` + `Retry-After`
- No se registran `userId` ni contenido en logs
- Limitación: almacén en memoria por proceso (ver [backend.md](./backend.md))

---

## Checklist de revisión de seguridad

- [ ] 401 antes de cualquier llamada a DeepSeek o a la base de datos
- [ ] `checkRateLimit` después del guard de sesión y antes de validar el body
- [ ] Toda función de datos recibe `userId` como primer parámetro
- [ ] Conversación ajena ⇒ 404, no 403
- [ ] `DEEPSEEK_API_KEY` ausente de logs, respuestas y del bundle de cliente
- [ ] Ninguna variable secreta con prefijo `NEXT_PUBLIC_`
- [ ] `nextCookies()` sigue siendo el último plugin
- [ ] zod limita el tamaño del body (50 mensajes × 8000 caracteres)
- [ ] La respuesta del modelo se renderiza como texto, sin `dangerouslySetInnerHTML`
- [ ] El mensaje de error del upstream no se reenvía al cliente

---

## Limitaciones conocidas del MVP

| Limitación | Impacto | Salida |
| ---------- | ------- | ------ |
| Sin verificación de email | cuentas con email falso | activar `requireEmailVerification` + proveedor de correo |
| Sin recuperación de contraseña | usuario bloqueado | flujo de reset de Better Auth |
| Sin MFA | — | plugin de Better Auth |
| Sin rotación de sesión explícita | — | configuración de `session` en Better Auth |
| Contenido de chat sin cifrar en reposo | privacidad | cifrado a nivel de columna o de disco |
| Rate limit no distribuido | ineficaz con varias instancias | Redis |

---

## Interconnections

- **→ Database:** `drizzleAdapter` sobre `user`/`session`/`account`/`verification`; ver [database.md](./database.md)
- **→ Backend:** `getSession()` en handlers y actions; ver [backend.md](./backend.md)
- **→ Frontend:** redirects y link condicional a `/chat`; ver [frontend.md](./frontend.md)
- **→ API:** guard previo al contrato de `/api/chat`; ver [api.md](./api.md)

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
| ------- | -------------- | -------- |
| Login "funciona" pero sigue sin sesión | `nextCookies()` no es el último plugin | moverlo al final del array |
| 401 desde `/chat` con sesión visible en el navegador | puerto distinto (worktree) | iniciar sesión en el mismo origen |
| `getSession()` devuelve `null` en un route handler | se llamó después de iniciar la respuesta | moverlo al principio del handler |
| Sesión inválida tras recrear la base | la fila de `session` ya no existe | volver a iniciar sesión |
| Error de env en producción | falta `BETTER_AUTH_SECRET` | definirla; es obligatoria con `NODE_ENV=production` |

---

**Maintained by:** @security-auditor
**Review cycle:** cada PR que toque `/api/chat` o server actions
