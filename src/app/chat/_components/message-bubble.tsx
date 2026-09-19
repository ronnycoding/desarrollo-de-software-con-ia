import type { ChatMessage } from "~/server/ai/chat-schema";

type MessageBubbleProps = {
	message: ChatMessage;
	/** True while this is the assistant message currently receiving chunks. */
	isStreaming?: boolean;
};

const userBubbleClass =
	"max-w-[80%] whitespace-pre-wrap rounded-2xl bg-[hsl(280,100%,70%)]/80 px-4 py-2 text-white";
const assistantBubbleClass =
	"max-w-[80%] whitespace-pre-wrap rounded-2xl bg-white/10 px-4 py-2 text-white";

/**
 * Presentational bubble for a single chat turn. `aria-live="polite"` is only
 * set on the assistant bubble while it is actively streaming, so screen
 * readers announce the growing reply without re-announcing settled messages.
 */
export function MessageBubble({
	message,
	isStreaming = false,
}: MessageBubbleProps) {
	const isUser = message.role === "user";

	return (
		<div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
			<p
				aria-live={isStreaming ? "polite" : undefined}
				className={isUser ? userBubbleClass : assistantBubbleClass}
			>
				{message.content}
			</p>
		</div>
	);
}
