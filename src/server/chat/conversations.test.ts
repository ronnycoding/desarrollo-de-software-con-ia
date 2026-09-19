import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import {
	appendMessage,
	createConversation,
	deleteConversation,
	getConversation,
	listConversations,
	listMessages,
	renameConversation,
} from "~/server/chat/conversations";
import { db } from "~/server/db";
import { message, user } from "~/server/db/schema";

/**
 * Runs against the real local Postgres (see `src/test/setup.ts`), not mocks:
 * user-scoping is the actual security boundary of this repository, so it is
 * verified with two real rows in the `user` table rather than stubbed ids.
 */

let userAId: string;
let userBId: string;

beforeAll(async () => {
	userAId = crypto.randomUUID();
	userBId = crypto.randomUUID();
	await db.insert(user).values([
		{
			id: userAId,
			name: "Test User A",
			email: `${userAId}@conversations.test`,
			emailVerified: false,
		},
		{
			id: userBId,
			name: "Test User B",
			email: `${userBId}@conversations.test`,
			emailVerified: false,
		},
	]);
});

afterAll(async () => {
	// Cascades to every conversation (and message) created below — `user.id`
	// is the FK root for both tables.
	await db.delete(user).where(eq(user.id, userAId));
	await db.delete(user).where(eq(user.id, userBId));
});

describe("conversations repository", () => {
	test("a user cannot read another user's conversation", async () => {
		const convo = await createConversation(userAId, "A's conversation");

		expect(await getConversation(userBId, convo.id)).toBeNull();
		expect(await getConversation(userAId, convo.id)).not.toBeNull();
	});

	test("appendMessage and listMessages are scoped to the owning user", async () => {
		const convo = await createConversation(userAId, "Scoped");

		expect(await appendMessage(userBId, convo.id, "user", "hi")).toBeNull();
		expect(await listMessages(userBId, convo.id)).toEqual([]);

		const own = await appendMessage(userAId, convo.id, "user", "hi");
		expect(own).not.toBeNull();

		const messages = await listMessages(userAId, convo.id);
		expect(messages).toHaveLength(1);
		expect(messages[0]?.content).toBe("hi");
	});

	test("listConversations orders by updatedAt desc", async () => {
		const first = await createConversation(userAId, "First");
		const second = await createConversation(userAId, "Second");

		// Bumping `first` after `second` was created is what the ordering
		// actually depends on, not the gap between the two creations.
		await new Promise((resolve) => setTimeout(resolve, 20));
		await appendMessage(userAId, first.id, "user", "bump");

		const ids = (await listConversations(userAId)).map((c) => c.id);
		expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
	});

	test("renameConversation and deleteConversation are scoped to the owning user", async () => {
		const convo = await createConversation(userAId, "Original");

		expect(await renameConversation(userBId, convo.id, "Hacked")).toBeNull();
		expect(
			await renameConversation(userAId, convo.id, "Renamed"),
		).not.toBeNull();

		expect(await deleteConversation(userBId, convo.id)).toBe(false);
		expect(await deleteConversation(userAId, convo.id)).toBe(true);
		expect(await getConversation(userAId, convo.id)).toBeNull();
	});

	test("deleteConversation cascades to its messages", async () => {
		const convo = await createConversation(userAId, "To delete");
		await appendMessage(userAId, convo.id, "user", "will be gone");

		expect(await deleteConversation(userAId, convo.id)).toBe(true);

		const rows = await db
			.select()
			.from(message)
			.where(eq(message.conversationId, convo.id));
		expect(rows).toHaveLength(0);
	});
});
