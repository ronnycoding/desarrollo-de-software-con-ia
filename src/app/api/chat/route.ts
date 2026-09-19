import Anthropic from "@anthropic-ai/sdk";

import { chatRequestSchema } from "~/server/ai/chat-schema";
import {
	DEEPSEEK_MODEL,
	DEFAULT_MAX_TOKENS,
	deepseek,
} from "~/server/ai/deepseek";
import { DEFAULT_SYSTEM_PROMPT } from "~/server/ai/prompts";
import { getSession } from "~/server/better-auth/server";
import {
	appendMessage,
	createConversation,
	getConversation,
} from "~/server/chat/conversations";

/**
 * Better Auth and the Postgres driver both need Node APIs, so this handler can
 * never move to the `edge` runtime.
 */
export const runtime = "nodejs";

const STREAM_HEADERS = {
	"Content-Type": "text/plain; charset=utf-8",
	// `no-transform` keeps an intermediary from compressing or rewriting the
	// body — compression buffers the whole response and breaks incremental
	// delivery. `X-Accel-Buffering: no` does the same for nginx and compatible
	// proxies, which would otherwise hand the client everything at the end.
	"Cache-Control": "no-cache, no-transform",
	"X-Accel-Buffering": "no",
} as const;

/**
 * Comfortably above any body the schema would accept (50 messages × 8000
 * characters, worst case ~2.5 MB once UTF-8 and JSON escaping are counted) and
 * far below what would threaten the process.
 */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Ceiling on the wait for the provider's first token. The SDK's own `timeout`
 * only covers the wait for response headers, so a provider that accepts the
 * request and then goes quiet would otherwise hang this handler — and the
 * client socket — forever. Once text is flowing the stream is left alone: a
 * long answer is not a stalled one.
 */
const FIRST_TOKEN_TIMEOUT_MS = 60_000;

const encoder = new TextEncoder();

/** Text carried by a stream event; `undefined` for every other event type. */
function textOf(event: Anthropic.MessageStreamEvent): string | undefined {
	return event.type === "content_block_delta" &&
		event.delta.type === "text_delta"
		? event.delta.text
		: undefined;
}

/** 400 in the documented shape, for failures that never reach zod. */
function invalidRequest(message: string): Response {
	return Response.json(
		{
			error: "Invalid request",
			issues: [{ code: "custom", path: [], message }],
		},
		{ status: 400 },
	);
}

/**
 * Reads the body with a hard ceiling, returning `null` when it is exceeded.
 * `req.json()` buffers everything that arrives before any zod limit applies,
 * and App Router route handlers have no equivalent of the Pages router's
 * `bodyParser.sizeLimit`, so an authenticated client could otherwise exhaust
 * the process with one large POST. `Content-Length` is only a shortcut — the
 * read itself is bounded, since the header is client-supplied and optional.
 */
async function readBoundedBody(
	req: Request,
	limit: number,
): Promise<string | null> {
	const declared = Number(req.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > limit) {
		return null;
	}

	const reader = req.body?.getReader();
	if (!reader) {
		return "";
	}

	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		size += value.length;
		if (size > limit) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}

	const body = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.length;
	}
	return new TextDecoder().decode(body);
}

/** Concatenated text of a finished message, for providers that never sent a delta. */
function textOfMessage(message: Anthropic.Message): string {
	return message.content
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("");
}

export async function POST(req: Request): Promise<Response> {
	// First, and outside the `ReadableStream`: `getSession()` reads `headers()`,
	// which is unavailable once the response has started. It also has to run
	// before anything reaches DeepSeek — an anonymous request must never spend
	// provider tokens.
	const session = await getSession();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const raw = await readBoundedBody(req, MAX_BODY_BYTES);
	if (raw === null) {
		return invalidRequest("Body exceeds the maximum accepted size.");
	}

	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		// A malformed body never reaches zod, so shape the issue by hand rather
		// than let the parse error escape as a 500.
		return invalidRequest("Body must be valid JSON.");
	}

	const parsed = chatRequestSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid request", issues: parsed.error.issues },
			{ status: 400 },
		);
	}

	// zod's `min(1)` plus the "last message is user" refinement guarantee this
	// is present, but `noUncheckedIndexedAccess` still types `.at(-1)` as
	// possibly `undefined`.
	const lastUserMessage = parsed.data.messages.at(-1);
	if (!lastUserMessage) {
		return invalidRequest("Send at least one message.");
	}

	// Resolved — and, for an unknown or foreign id, rejected — before anything
	// reaches DeepSeek: an authenticated request must never spend provider
	// tokens on a conversation it cannot touch.
	const conversation = parsed.data.conversationId
		? await getConversation(session.user.id, parsed.data.conversationId)
		: await createConversation(
				session.user.id,
				lastUserMessage.content.slice(0, 60),
			);
	if (!conversation) {
		return Response.json({ error: "Conversation not found" }, { status: 404 });
	}

	await appendMessage(
		session.user.id,
		conversation.id,
		"user",
		lastUserMessage.content,
	);

	const system = conversation.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

	// One signal for both ways this request can be cut short: the client going
	// away, and the provider never answering. `timedOut` tells them apart in
	// the catch below — the SDK reports either as an `APIUserAbortError`.
	const upstream = new AbortController();
	let timedOut = false;
	const abortOnDisconnect = () => upstream.abort();
	req.signal.addEventListener("abort", abortOnDisconnect, { once: true });
	const firstTokenDeadline = setTimeout(() => {
		timedOut = true;
		upstream.abort();
	}, FIRST_TOKEN_TIMEOUT_MS);

	// Only `model`, `max_tokens`, `system`, `messages` and `temperature` may be
	// sent: DeepSeek answers 400 to any other parameter, with no graceful
	// degradation.
	const stream = deepseek.messages.stream(
		{
			model: DEEPSEEK_MODEL,
			max_tokens: DEFAULT_MAX_TOKENS,
			system,
			messages: parsed.data.messages,
		},
		{ signal: upstream.signal },
	);

	const events = stream[Symbol.asyncIterator]();

	// Drain up to the first text delta *before* returning a Response. Once the
	// 200 is on the wire the status can no longer change, so this is the only
	// window in which an upstream failure can still surface as a 502.
	let firstText: string | undefined;
	let exhausted = false;
	try {
		while (firstText === undefined) {
			const next = await events.next();
			if (next.done) {
				exhausted = true;
				// Rejects if the stream ended without producing a message. It can
				// also legitimately resolve with text this loop never saw: DeepSeek
				// is an Anthropic-compatible shim, and a shim that returns its text
				// outside `text_delta` would otherwise yield a silent empty 200.
				firstText = textOfMessage(await stream.finalMessage());
				break;
			}
			firstText = textOf(next.value);
		}
	} catch (error) {
		stream.abort();
		// A provider that never sent a first token is an upstream failure, not a
		// cancellation, even though the SDK reports our own abort the same way.
		if (timedOut) {
			console.error("[POST /api/chat] upstream timed out before first token");
			return Response.json({ error: "Upstream error" }, { status: 502 });
		}
		// `APIUserAbortError` extends `APIError`, so it has to be ruled out
		// before it: the client hanging up is not an upstream fault and must not
		// raise a 502 in the logs. Nobody is left to read this status.
		if (error instanceof Anthropic.APIUserAbortError) {
			return new Response(null, { status: 499 });
		}
		// `AnthropicError`, not `APIError`: the SDK re-wraps anything that is not
		// already one of its own errors into a bare `AnthropicError`, so a
		// connection dropped mid-SSE or an unparseable event would slip past an
		// `APIError` check and escape as a 500 HTML page.
		if (error instanceof Anthropic.AnthropicError) {
			// The upstream message can name the provider or echo the request, so
			// it stays in the server log: the client only gets the status.
			console.error("[POST /api/chat] upstream error", error);
			return Response.json({ error: "Upstream error" }, { status: 502 });
		}
		throw error;
	} finally {
		// Only the deadline is lifted here. The disconnect listener stays armed
		// for the rest of the stream so a client hanging up still aborts the
		// upstream request even if `cancel()` never runs; `once` retires it.
		clearTimeout(firstTokenDeadline);
	}

	// Set by `cancel()`. The SDK's iterator buffers events, so after the client
	// disconnects `events.next()` can still resolve with a real event while the
	// controller is already closed — enqueuing then throws, and that throw would
	// otherwise be logged as a stream error rather than the disconnect it is.
	let clientGone = false;

	// Accumulated as chunks are enqueued so a client cancellation still has
	// something to persist; overwritten with the authoritative concatenation
	// from `finalMessage()` once the stream ends normally.
	let assistantText = firstText ?? "";

	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				if (firstText) {
					controller.enqueue(encoder.encode(firstText));
				}
				if (!exhausted) {
					for (;;) {
						const next = await events.next();
						if (next.done || clientGone) {
							break;
						}
						const text = textOf(next.value);
						if (text) {
							assistantText += text;
							controller.enqueue(encoder.encode(text));
						}
					}
					if (!clientGone) {
						assistantText = textOfMessage(await stream.finalMessage());
					}
				}
				if (!clientGone) {
					await appendMessage(
						session.user.id,
						conversation.id,
						"assistant",
						assistantText,
					);
				}
				controller.close();
			} catch (error) {
				// The 200 and its headers already went out, so the status cannot
				// change: erroring the controller cuts the connection, which is
				// the only signal left. A client that hung up is the expected way
				// to get here and is not worth logging.
				if (!clientGone && !(error instanceof Anthropic.APIUserAbortError)) {
					console.error("[POST /api/chat] stream error", error);
				}
				controller.error(error);
			}
		},
		cancel() {
			// The client hung up — stop the upstream request instead of leaving
			// it running at the provider. `cancel()` cannot be awaited by the
			// platform, so persisting the partial reply is fire-and-forget: a
			// best-effort courtesy to the next page load, not part of the
			// response.
			clientGone = true;
			stream.abort();
			void appendMessage(
				session.user.id,
				conversation.id,
				"assistant",
				assistantText,
			);
		},
	});

	return new Response(body, {
		status: 200,
		headers: { ...STREAM_HEADERS, "X-Conversation-Id": conversation.id },
	});
}
