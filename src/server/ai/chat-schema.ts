import { z } from "zod";

/**
 * Input contract for `POST /api/chat`.
 *
 * This module imports `zod` and nothing else on purpose: client components
 * import `ChatMessage` from here, and a `~/server/*` or SDK import would drag
 * the DeepSeek client — and its API key — into the browser bundle.
 */

const chatMessageSchema = z.object({
	role: z.enum(["user", "assistant"]),
	content: z
		.string()
		.min(1, "A message cannot be empty.")
		.max(8000, "A message cannot exceed 8000 characters."),
});

export const chatRequestSchema = z.object({
	messages: z
		.array(chatMessageSchema)
		.min(1, "Send at least one message.")
		.max(50, "A conversation cannot exceed 50 messages.")
		// zod runs every array check, so an empty array would otherwise report
		// both this and the `min(1)` message. Let `min(1)` own that case.
		.refine(
			(messages) => messages.length === 0 || messages.at(-1)?.role === "user",
			{ message: "The last message must come from the user." },
		),
	/**
	 * Accepted but ignored while conversations are not persisted yet. Declared
	 * now so the contract does not have to change once they are.
	 */
	conversationId: z.string().uuid().optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
