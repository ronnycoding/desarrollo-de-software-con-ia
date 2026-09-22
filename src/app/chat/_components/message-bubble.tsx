import { MarkdownMessage } from "~/app/chat/_components/markdown-message";
import type { ChatMessage } from "~/server/ai/chat-schema";

type MessageBubbleProps = {
	message: ChatMessage;
	/** True while this is the assistant message currently receiving chunks. */
	isStreaming?: boolean;
};

const bubbleClass = "max-w-[80%] rounded-2xl px-4 py-2 text-white";
/**
 * Only the user bubble keeps `whitespace-pre-wrap`: what they typed is shown
 * verbatim, including their own line breaks. The assistant bubble must not
 * have it — markdown already turns blank lines into block elements, and
 * preserving the source newlines on top of that would double every gap.
 */
const userBubbleClass = `${bubbleClass} whitespace-pre-wrap bg-[hsl(280,100%,70%)]/80`;
const assistantBubbleClass = `${bubbleClass} bg-white/10`;

/**
 * Presentational bubble for a single chat turn. `aria-live="polite"` is only
 * set on the assistant bubble while it is actively streaming, so screen
 * readers announce the growing reply without re-announcing settled messages.
 *
 * The assistant side renders markdown and therefore wraps a `<div>`: its
 * output contains block elements such as `<p>`, `<ul>` and `<pre>`, which are
 * invalid inside a `<p>` and would be hoisted out of it by the browser's
 * parser, breaking the bubble mid-stream. User text stays in a `<p>` and is
 * never parsed as markdown, so typing `*hello*` or `# hi` shows exactly that.
 */
export function MessageBubble({
	message,
	isStreaming = false,
}: MessageBubbleProps) {
	const isUser = message.role === "user";

	if (isUser) {
		return (
			<div className="flex justify-end">
				<p className={userBubbleClass}>{message.content}</p>
			</div>
		);
	}

	return (
		<div className="flex justify-start">
			<div
				aria-live={isStreaming ? "polite" : undefined}
				className={assistantBubbleClass}
			>
				<MarkdownMessage content={message.content} />
			</div>
		</div>
	);
}
