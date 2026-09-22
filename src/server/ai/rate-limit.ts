import { env } from "~/env";

/**
 * Sliding window of 60 000 ms per `userId`, so switching conversations
 * cannot evade it — the key is the user, not the conversation. In-memory and
 * per-process: acceptable for the single-instance MVP, not for a
 * multi-instance deployment, where a shared store (Redis or similar) would be
 * needed instead.
 *
 * Cached on `globalThis`, same pattern as `globalForDb.conn` in
 * `src/server/db/index.ts`, so HMR in development does not reset the counters
 * on every reload.
 */
export const WINDOW_MS = 60_000;

/**
 * Mirrors the zod default in `src/env.js`. `skipValidation` (set by
 * `src/test/setup.ts`, and by any `SKIP_ENV_VALIDATION=1` build) bypasses zod
 * entirely, so a defaulted variable reads back as `undefined` at runtime even
 * though its type says `number` — and `length >= undefined` is always false,
 * which would silently disable the limit rather than fail loudly. Resolved
 * once here, and exported so tests assert against the same number.
 */
const DEFAULT_LIMIT = 20;

export const RATE_LIMIT_PER_MINUTE: number = Number.isInteger(
	env.CHAT_RATE_LIMIT_PER_MINUTE,
)
	? env.CHAT_RATE_LIMIT_PER_MINUTE
	: DEFAULT_LIMIT;

const globalForRateLimit = globalThis as unknown as {
	chatRateLimit: Map<string, number[]> | undefined;
};

const hits = globalForRateLimit.chatRateLimit ?? new Map<string, number[]>();
if (env.NODE_ENV !== "production") globalForRateLimit.chatRateLimit = hits;

export type RateLimitResult =
	| { allowed: true }
	| { allowed: false; retryAfterSeconds: number };

/**
 * Prunes timestamps outside the window on every call, then admits the
 * request if fewer than `RATE_LIMIT_PER_MINUTE` remain. `now` is a
 * parameter, not `Date.now()` read internally, so tests can exercise window
 * expiry without a real clock.
 */
export function checkRateLimit(
	userId: string,
	now: number = Date.now(),
): RateLimitResult {
	const windowStart = now - WINDOW_MS;
	const previous = hits.get(userId) ?? [];
	const withinWindow = previous.filter((timestamp) => timestamp > windowStart);

	if (withinWindow.length >= RATE_LIMIT_PER_MINUTE) {
		const oldest = withinWindow[0];
		// `withinWindow` is non-empty here — its length is at least
		// `RATE_LIMIT_PER_MINUTE`, which is at least 1 — but
		// `noUncheckedIndexedAccess` still types the access as possibly
		// `undefined`.
		const retryAfterSeconds = Math.ceil(
			((oldest ?? now) + WINDOW_MS - now) / 1000,
		);
		hits.set(userId, withinWindow);
		return { allowed: false, retryAfterSeconds };
	}

	withinWindow.push(now);
	hits.set(userId, withinWindow);
	return { allowed: true };
}
