import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { conversation, message } from "~/server/db/schema";

/**
 * The only module allowed to touch `conversation`/`message` directly. Every
 * function takes `userId` first and filters by it: isolation between users
 * lives here, not only in the route or the page, so a caller that forgets to
 * check ownership still cannot leak another user's data.
 */

export type Conversation = typeof conversation.$inferSelect;
export type Message = typeof message.$inferSelect;
export type MessageRole = Message["role"];

export async function createConversation(
	userId: string,
	title?: string,
): Promise<Conversation> {
	const [row] = await db
		.insert(conversation)
		.values({ userId, title })
		.returning();
	if (!row) {
		// Only reachable if the insert itself failed silently, which Postgres
		// does not do — this is not a "not found" case, so it throws instead
		// of returning `null` like the read/update functions below.
		throw new Error("Failed to create conversation");
	}
	return row;
}

/** `null` for both a missing id and one owned by another user. */
export async function getConversation(
	userId: string,
	id: string,
): Promise<Conversation | null> {
	const [row] = await db
		.select()
		.from(conversation)
		.where(and(eq(conversation.id, id), eq(conversation.userId, userId)));
	return row ?? null;
}

export async function listConversations(
	userId: string,
): Promise<Conversation[]> {
	return db
		.select()
		.from(conversation)
		.where(eq(conversation.userId, userId))
		.orderBy(desc(conversation.updatedAt));
}

/**
 * `null` when `conversationId` does not exist or belongs to another user —
 * checked here rather than trusted from the caller, so an isolation bug
 * upstream cannot still append to someone else's conversation.
 */
export async function appendMessage(
	userId: string,
	conversationId: string,
	role: MessageRole,
	content: string,
): Promise<Message | null> {
	const owned = await getConversation(userId, conversationId);
	if (!owned) {
		return null;
	}

	const [row] = await db
		.insert(message)
		.values({ conversationId, role, content })
		.returning();
	if (!row) {
		return null;
	}

	await db
		.update(conversation)
		.set({ updatedAt: new Date() })
		.where(eq(conversation.id, conversationId));

	return row;
}

/** `[]` when `conversationId` does not exist or belongs to another user. */
export async function listMessages(
	userId: string,
	conversationId: string,
): Promise<Message[]> {
	const owned = await getConversation(userId, conversationId);
	if (!owned) {
		return [];
	}

	return db
		.select()
		.from(message)
		.where(eq(message.conversationId, conversationId))
		.orderBy(asc(message.createdAt));
}

/** `null` when `id` does not exist or belongs to another user. */
export async function renameConversation(
	userId: string,
	id: string,
	title: string,
): Promise<Conversation | null> {
	const [row] = await db
		.update(conversation)
		.set({ title, updatedAt: new Date() })
		.where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
		.returning();
	return row ?? null;
}

/**
 * `false` when `id` does not exist or belongs to another user. Messages are
 * removed by the `onDelete: "cascade"` foreign key, not a second query.
 */
export async function deleteConversation(
	userId: string,
	id: string,
): Promise<boolean> {
	const [row] = await db
		.delete(conversation)
		.where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
		.returning();
	return row !== undefined;
}
