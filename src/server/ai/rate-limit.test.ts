import { describe, expect, test } from "bun:test";

import { checkRateLimit, RATE_LIMIT_PER_MINUTE } from "~/server/ai/rate-limit";

/**
 * Each test uses its own random `userId`: `checkRateLimit`'s `Map` is module
 * (and, via `globalThis`, process) level state, so a shared key would leak
 * counts between tests running in the same file.
 */
function newUserId(): string {
	return crypto.randomUUID();
}

// Not `env.CHAT_RATE_LIMIT_PER_MINUTE`: `src/test/setup.ts` skips env
// validation, so the defaulted variable reads back `undefined` here.
const LIMIT = RATE_LIMIT_PER_MINUTE;

describe("checkRateLimit", () => {
	test("allows requests within the window and under the limit", () => {
		const userId = newUserId();
		const now = Date.now();

		for (let i = 0; i < LIMIT - 1; i++) {
			expect(checkRateLimit(userId, now + i).allowed).toBe(true);
		}
	});

	test("allows exactly the limit", () => {
		const userId = newUserId();
		const now = Date.now();

		for (let i = 0; i < LIMIT; i++) {
			expect(checkRateLimit(userId, now + i).allowed).toBe(true);
		}
	});

	test("rejects the request that exceeds the limit", () => {
		const userId = newUserId();
		const now = Date.now();

		for (let i = 0; i < LIMIT; i++) {
			checkRateLimit(userId, now + i);
		}

		const result = checkRateLimit(userId, now + LIMIT);
		expect(result.allowed).toBe(false);
		if (!result.allowed) {
			expect(result.retryAfterSeconds).toBeGreaterThan(0);
		}
	});

	test("admits requests again once the window expires", () => {
		const userId = newUserId();
		const now = Date.now();

		for (let i = 0; i < LIMIT; i++) {
			checkRateLimit(userId, now + i);
		}
		expect(checkRateLimit(userId, now + LIMIT).allowed).toBe(false);

		// One millisecond past the 60 000 ms window from the very first hit.
		const afterWindow = now + 60_000 + 1;
		expect(checkRateLimit(userId, afterWindow).allowed).toBe(true);
	});

	test("isolates the limit per userId", () => {
		const userA = newUserId();
		const userB = newUserId();
		const now = Date.now();

		for (let i = 0; i < LIMIT; i++) {
			checkRateLimit(userA, now + i);
		}
		expect(checkRateLimit(userA, now + LIMIT).allowed).toBe(false);

		// Untouched: user B has never called `checkRateLimit` before.
		expect(checkRateLimit(userB, now + LIMIT).allowed).toBe(true);
	});
});
