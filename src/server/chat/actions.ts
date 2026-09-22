"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSession } from "~/server/better-auth/server";
import { updateSystemPrompt } from "~/server/chat/conversations";

export type ActionState = { ok: true } | { ok: false; error: string };

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
