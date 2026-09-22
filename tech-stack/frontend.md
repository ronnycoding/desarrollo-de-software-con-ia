# Frontend Architecture

**Domain:** Frontend
**Primary Technology:** Next.js 15 App Router + React 19
**Last Updated:** 2026-09-19

---

## Technology Stack

### Core Framework
- **Framework:** Next.js ^15.2.3 (App Router, `next dev --turbo`)
- **UI Library:** React ^19 (server components por defecto)
- **Language:** TypeScript ^5.8.2
- **Type System:** `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` (usar `import type`)

### Build & Development
- **Package Manager:** Bun (`bun.lock`)
- **Bundler dev:** Turbopack (`bun dev`)
- **Build:** `next build` (valida env vía `next.config.js` → `src/env.js`)
- **Dev server:** http://localhost:3000

### Styling
- **Approach:** Tailwind CSS ^4.0.15 vía `@tailwindcss/postcss`
- **Global styles:** `src/styles/globals.css`
- **UI Library:** ninguna. Componentes propios, sin shadcn ni MUI
- **Ordenación de clases:** regla Biome `useSortedClasses` (`clsx`/`cva`/`cn`)
- **Iconos:** ninguno en el MVP

### State Management
- **Global state:** ninguno. No hay Redux/Zustand/Context de aplicación
- **Local state:** `useState` en `ChatPanel` (`messages`, `status`, `input`) + `useRef` para el `AbortController`
- **Server state:** el servidor es la fuente de verdad; el historial llega como props desde server components
- **Form state:** `useActionState` (React 19) en los formularios de rename y system prompt

### Routing
- **Router:** App Router (file-based)
- **Estrategia:** server components por defecto; `"use client"` solo donde hay interacción

| Ruta | Tipo | Responsabilidad |
| ---- | ---- | --------------- |
| `/` | server + server actions inline | sign in / sign up / sign out, link a `/chat` |
| `/chat` | server | guard de sesión, `<ChatPanel />` sin historial |
| `/chat/[conversationId]` | server | carga historial y `systemPrompt`, renderiza `<ChatSettings />` + `<ChatPanel />` |
| `/chat/layout.tsx` | server | sidebar con `listConversations(userId)` |

### Data Fetching
- **Chat:** `fetch("/api/chat")` + `res.body.getReader()` + `TextDecoder({ stream: true })`
- **CRUD:** server actions importadas directamente en los formularios
- **Lectura inicial:** consultas Drizzle dentro de server components (sin capa HTTP)
- **HTTP client:** `fetch` nativo. Sin axios, sin React Query, sin SWR

### Testing
- **Runner:** `bun test` (introducido en #A-02)
- **Cobertura frontend en el MVP:** manual. Los tests automatizados de #C-03 cubren schema, rate limit y route handler
- **Futuro:** Playwright para el flujo de streaming end-to-end

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                  # metadata de la app
│   ├── page.tsx                    # auth: sign in / sign up / sign out
│   ├── chat/
│   │   ├── layout.tsx              # sidebar server-rendered (#B-02)
│   │   ├── page.tsx                # chat nuevo (#01-02)
│   │   ├── [conversationId]/
│   │   │   └── page.tsx            # chat con historial (#A-04)
│   │   └── _components/
│   │       ├── chat-panel.tsx      # "use client" — streaming (#01-02)
│   │       ├── message-bubble.tsx  # presentacional (#01-02)
│   │       ├── conversation-item.tsx # "use client" — rename/delete (#B-03)
│   │       └── chat-settings.tsx   # "use client" — system prompt (#C-02)
│   └── api/
│       ├── auth/[...all]/route.ts  # handler de Better Auth
│       └── chat/route.ts           # streaming (#01-01)
└── styles/globals.css
```

Convención: `_components/` con guion bajo para que App Router no lo trate como ruta.

---

## Key Dependencies

| Package | Version | Purpose |
| ------- | ------- | ------- |
| next | ^15.2.3 | framework y App Router |
| react / react-dom | ^19 | UI y server components |
| tailwindcss | ^4.0.15 | estilos |
| better-auth | ^1.3 | cliente `better-auth/react` en `src/server/better-auth/client.ts` |
| zod | ^3.24 | tipos compartidos vía `chat-schema.ts` |

`chat-schema.ts` solo importa `zod`, por eso un client component puede importar el tipo `ChatMessage` sin arrastrar código de servidor.

---

## Streaming en el cliente (contrato de `ChatPanel`)

```ts
type ChatPanelProps = {
	conversationId?: string;
	initialMessages?: ChatMessage[]; // tipo de src/server/ai/chat-schema.ts
};
```

Las props se declaran desde #01-02 aunque no se usen hasta #A-04: evita refactorizar el componente.

**Loop de streaming:**
1. Al enviar: `setMessages` funcional añade el mensaje del usuario y un placeholder vacío del asistente; `status = "streaming"`.
2. `fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages, conversationId }), signal })` — same-origin, la cookie de sesión viaja sola.
3. `!res.ok` → parsear el JSON de error, `status = "error"`, quitar el placeholder y **conservar el texto en el input** para reintentar.
4. `const reader = res.body?.getReader()` (guard de `undefined` por `noUncheckedIndexedAccess`), decodificar con `TextDecoder` y `{ stream: true }`, y hacer append al último mensaje del asistente con update funcional.
5. Stop: `controller.abort()`; capturar `AbortError`, conservar el texto parcial, `status = "idle"`.
6. Si la página no tenía id, leer `X-Conversation-Id` de la respuesta y `router.replace("/chat/" + id)` (#A-04).
7. Send deshabilitado si `input.trim() === ""` o `status === "streaming"`.

**Por qué no otras opciones:**
- Server actions: no pueden devolver un stream de texto incremental.
- `EventSource`: solo GET, no permite enviar el historial en el body.
- Parsing SSE: innecesario, el body es texto plano.

Cada mensaje lleva un `id` de cliente (`crypto.randomUUID()`) para usarlo como `key` (regla Biome `noArrayIndexKey`).

---

## Accesibilidad

- `<label>` asociado al textarea del chat
- `type="button"` explícito en Stop (regla `useButtonType`)
- `aria-live="polite"` en la burbuja del asistente en curso
- Foco devuelto al textarea al terminar el stream
- `<details>/<summary>` nativos para el panel de system prompt (accesible por teclado sin dependencias)

---

## Performance

- **Code splitting:** automático por ruta; los client components son hojas pequeñas
- **Server components:** el historial y el sidebar no viajan como JS
- **Auto-scroll:** durante el stream, sin librería
- **Bundle:** sin dependencias UI pesadas; el SDK de Anthropic vive solo en el servidor
- **Objetivo percibido:** primer token en pantalla < 2 s

---

## Environment Variables

El frontend **no** consume variables de entorno propias: no hay ninguna `NEXT_PUBLIC_*`. La URL de la API es relativa (`/api/chat`), lo que hace la app portable entre entornos sin configuración.

---

## Best Practices

1. **Componentes:** buscar y reutilizar antes de crear (`component-reuse-first`). Extraer `inputClass`/`buttonClass` de `src/app/page.tsx` a un módulo compartido si se repiten.
2. **Client boundary:** `"use client"` lo más abajo posible en el árbol.
3. **Updates de estado:** siempre funcionales durante el streaming (llegan muchos chunks seguidos).
4. **Errores:** mostrar el `error` del JSON del servidor, nunca un stack; preservar el input del usuario.
5. **Biome:** `bun run check:write` antes de commitear (tabs, atributos JSX ordenados, clases Tailwind ordenadas, imports organizados).

---

## Interconnections

### → Backend API
- **Protocolo:** `POST /api/chat`, respuesta `text/plain` streameada
- **Autenticación:** cookie de sesión same-origin
- **Errores:** 400/401/404/429/502 en JSON
- **Documentación:** [api.md](./api.md)

### → Server Actions
- `renameConversationAction`, `deleteConversationAction`, `updateSystemPromptAction` con `FormData`
- **Documentación:** [backend.md](./backend.md)

### → Authentication
- `getSession()` en cada página del dominio de chat; sin sesión, `redirect("/?error=Sign%20in%20to%20chat")`
- **Documentación:** [authentication.md](./authentication.md)

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
| ------- | -------------- | -------- |
| La respuesta aparece de golpe, no progresivamente | un proxy está buffereando | verificar los headers `Cache-Control: no-cache, no-transform` y `X-Accel-Buffering: no` |
| `res.body` es `null` | respuesta de error, no un stream | comprobar `res.ok` antes de leer |
| El botón Stop no corta nada | `AbortController` recreado en cada render | guardarlo en `useRef` |
| Warning de key duplicada | índice de array como `key` | usar el `id` de cliente del mensaje |
| 401 al enviar desde `/chat` | sesión expirada | la página redirige; recargar y volver a iniciar sesión |

---

**Maintained by:** @frontend-developer
**Review cycle:** al cerrar Epic B
