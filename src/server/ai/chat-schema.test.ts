import { describe, expect, test } from "bun:test";

import { chatRequestSchema } from "~/server/ai/chat-schema";

describe("chatRequestSchema", () => {
	test("accepts a valid body", () => {
		const result = chatRequestSchema.safeParse({
			messages: [{ role: "user", content: "hi" }],
		});
		expect(result.success).toBe(true);
	});

	test("accepts a valid body with a conversationId", () => {
		const result = chatRequestSchema.safeParse({
			messages: [{ role: "user", content: "hi" }],
			conversationId: crypto.randomUUID(),
		});
		expect(result.success).toBe(true);
	});

	test("rejects an empty messages array", () => {
		const result = chatRequestSchema.safeParse({ messages: [] });
		expect(result.success).toBe(false);
	});

	test("rejects a body with no messages field", () => {
		const result = chatRequestSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	test("rejects more than 50 messages", () => {
		const messages = Array.from({ length: 51 }, (_, index) => ({
			role: index % 2 === 0 ? "user" : ("assistant" as const),
			content: "hi",
		}));
		const result = chatRequestSchema.safeParse({ messages });
		expect(result.success).toBe(false);
	});

	test("accepts exactly 50 messages", () => {
		const messages = Array.from({ length: 50 }, (_, index) => ({
			role: index % 2 === 0 ? ("assistant" as const) : ("user" as const),
			content: "hi",
		})).map((message, index, arr) =>
			index === arr.length - 1
				? { ...message, role: "user" as const }
				: message,
		);
		const result = chatRequestSchema.safeParse({ messages });
		expect(result.success).toBe(true);
	});

	test("rejects a last message that is not from the user", () => {
		const result = chatRequestSchema.safeParse({
			messages: [
				{ role: "user", content: "hi" },
				{ role: "assistant", content: "hello" },
			],
		});
		expect(result.success).toBe(false);
	});

	test("rejects a malformed conversationId", () => {
		const result = chatRequestSchema.safeParse({
			messages: [{ role: "user", content: "hi" }],
			conversationId: "not-a-uuid",
		});
		expect(result.success).toBe(false);
	});

	test("rejects an empty message content", () => {
		const result = chatRequestSchema.safeParse({
			messages: [{ role: "user", content: "" }],
		});
		expect(result.success).toBe(false);
	});

	test("rejects a message over 8000 characters", () => {
		const result = chatRequestSchema.safeParse({
			messages: [{ role: "user", content: "a".repeat(8001) }],
		});
		expect(result.success).toBe(false);
	});
});
