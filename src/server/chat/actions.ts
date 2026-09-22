"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSession } from "~/server/better-auth/server";
import type { ActionState } from "~/server/chat/action-state";
import {
	deleteConversation,
	renameConversation,
	updateSystemPrompt,
} from "~/server/chat/conversations";

function getString(formData: FormData, key: string) {
	const value = formData.get(key);
	return typeof value === "string" ? value : "";
}

const renameSchema = z.object({
	id: z.string().uuid("Invalid conversation id."),
	// `.trim()` runs before `.min()`, so a title that is only whitespace is
	// rejected the same way as an empty one. 256 matches `conversation.title`
	// (`varchar(256)`) so a would-be-valid title never fails at the DB layer.
	title: z
		.string()
		.trim()
		.min(1, "Title cannot be empty.")
		.max(256, "Title is too long."),
});

export async function renameConversationAction(
	_prevState: ActionState,
	formData: FormData,
): Promise<ActionState> {
	const session = await getSession();
	if (!session) {
		// No DB call on purpose: an unauthenticated request must never reach
		// the repository, not even to fail there.
		return { ok: false, error: "Unauthorized" };
	}

	const parsed = renameSchema.safeParse({
		id: getString(formData, "id"),
		title: getString(formData, "title"),
	});
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Invalid title.",
		};
	}

	// `renameConversation` filters by `userId` itself, so an `id` owned by
	// another user comes back `null` here rather than updating their row.
	const updated = await renameConversation(
		session.user.id,
		parsed.data.id,
		parsed.data.title,
	);
	if (!updated) {
		return { ok: false, error: "Conversation not found" };
	}

	revalidatePath("/chat", "layout");
	return { ok: true };
}

const deleteSchema = z.object({
	id: z.string().uuid("Invalid conversation id."),
	// FormData only carries strings; the client encodes the boolean as
	// "true"/"false" via a hidden input.
	active: z.enum(["true", "false"]),
});

export async function deleteConversationAction(
	_prevState: ActionState,
	formData: FormData,
): Promise<ActionState> {
	const session = await getSession();
	if (!session) {
		return { ok: false, error: "Unauthorized" };
	}

	const parsed = deleteSchema.safeParse({
		id: getString(formData, "id"),
		active: getString(formData, "active"),
	});
	if (!parsed.success) {
		return { ok: false, error: "Invalid request" };
	}

	const deleted = await deleteConversation(session.user.id, parsed.data.id);
	if (!deleted) {
		return { ok: false, error: "Conversation not found" };
	}

	revalidatePath("/chat", "layout");

	// Not wrapped in try/catch: `redirect()` throws a special Next.js
	// exception that must propagate, or this would report a false error.
	if (parsed.data.active === "true") {
		redirect("/chat");
	}

	return { ok: true };
}

const updateSystemPromptSchema = z.object({
	conversationId: z.string().uuid(),
	// Empty string is valid input — it means "clear the override" — so the
	// length ceiling alone guards this field; `""` is normalized to `null`
	// below rather than rejected.
	systemPrompt: z.string().max(4000, "Keep it under 4000 characters."),
});

/**
 * Guarded by `getSession()` and by `updateSystemPrompt`'s own ownership
 * check, so neither an anonymous caller nor one editing a conversation they
 * do not own can change another user's prompt. Appended at the end of this
 * file on purpose: the sidebar user story (#9) also writes here, and this is
 * the only function this task adds.
 */
export async function updateSystemPromptAction(
	_prevState: ActionState,
	formData: FormData,
): Promise<ActionState> {
	const session = await getSession();
	if (!session) {
		return { ok: false, error: "Sign in to change the system prompt." };
	}

	const parsed = updateSystemPromptSchema.safeParse({
		conversationId: formData.get("conversationId"),
		systemPrompt: formData.get("systemPrompt"),
	});
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Invalid input.",
		};
	}

	// Collapsed to `null` after trimming, so an all-whitespace value also
	// falls back to `DEFAULT_SYSTEM_PROMPT` instead of persisting as blanks.
	const normalized = parsed.data.systemPrompt.trim();
	const systemPrompt = normalized === "" ? null : normalized;

	const updated = await updateSystemPrompt(
		session.user.id,
		parsed.data.conversationId,
		systemPrompt,
	);
	if (!updated) {
		return {
			ok: false,
			error: "Conversation not found.",
		};
	}

	revalidatePath(`/chat/${parsed.data.conversationId}`);
	return { ok: true };
}
