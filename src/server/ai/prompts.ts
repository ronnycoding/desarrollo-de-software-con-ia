/**
 * Fallback system prompt. Sent as a plain string: DeepSeek rejects `system`
 * blocks carrying `cache_control`.
 */
export const DEFAULT_SYSTEM_PROMPT =
	"You are a helpful assistant. Answer clearly and concisely, in the language the user writes in. When you are unsure, say so instead of guessing.";
