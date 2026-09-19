"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { buttonClass, inputClass } from "~/app/_components/styles";
import { MessageBubble } from "~/app/chat/_components/message-bubble";
import type { ChatMessage } from "~/server/ai/chat-schema";

/** A `ChatMessage` plus a client-only id, used as the React list key. */
type ChatPanelMessage = ChatMessage & { id: string };

type ChatStatus = "idle" | "streaming" | "error";

type ChatPanelProps = {
	conversationId?: string;
	initialMessages?: ChatMessage[];
};

const ERROR_MESSAGE = "Something went wrong, try again";

function toChatMessage({ role, content }: ChatPanelMessage): ChatMessage {
	return { role, content };
}

export function ChatPanel({ conversationId, initialMessages }: ChatPanelProps) {
	const router = useRouter();
	const [messages, setMessages] = useState<ChatPanelMessage[]>(
		() =>
			initialMessages?.map((message) => ({
				...message,
				id: crypto.randomUUID(),
			})) ?? [],
	);
	const [input, setInput] = useState("");
	const [status, setStatus] = useState<ChatStatus>("idle");

	// Mutable, not state: it must be readable synchronously inside
	// `sendMessage` without waiting for a render, and it only ever moves from
	// `undefined` to a real id once — set from the prop when resuming a
	// conversation, or from the first response's `X-Conversation-Id` when
	// starting one.
	const conversationIdRef = useRef(conversationId);

	const abortControllerRef = useRef<AbortController | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);

	// The effect body never reads `messages` — it only needs to re-run every
	// time the array changes, including in-place content growth while a reply
	// streams in, so the view follows the conversation to the bottom.
	// biome-ignore lint/correctness/useExhaustiveDependencies: messages is a trigger, not a value read here.
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messages]);

	const canSend = input.trim() !== "" && status !== "streaming";

	async function sendMessage() {
		const trimmed = input.trim();
		if (trimmed === "" || status === "streaming") {
			return;
		}

		const userMessage: ChatPanelMessage = {
			id: crypto.randomUUID(),
			role: "user",
			content: trimmed,
		};
		const assistantMessage: ChatPanelMessage = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: "",
		};
		const history = [...messages, userMessage];

		setMessages([...history, assistantMessage]);
		setInput("");
		setStatus("streaming");

		const controller = new AbortController();
		abortControllerRef.current = controller;

		// Tracked outside React state so the catch block below can decide, from
		// a plain synchronous read, whether any text ever arrived — state
		// updates are batched and would not be safe to read back here.
		let assistantContent = "";

		try {
			const res = await fetch("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messages: history.map(toChatMessage),
					conversationId: conversationIdRef.current,
				}),
				signal: controller.signal,
			});

			// `res.body` is `null`-able under strict TS; a missing reader on an
			// otherwise-ok response is treated the same as a non-ok response.
			const reader = res.ok ? res.body?.getReader() : undefined;
			if (!res.ok || !reader) {
				setMessages((prev) =>
					prev.filter((message) => message.id !== assistantMessage.id),
				);
				setInput(trimmed);
				setStatus("error");
				return;
			}

			// The URL only moves once: after the first reply, `conversationIdRef`
			// is set and every later response reports back the same id.
			const newConversationId = res.headers.get("X-Conversation-Id");
			if (newConversationId && !conversationIdRef.current) {
				conversationIdRef.current = newConversationId;
				router.replace(`/chat/${newConversationId}`);
			}

			const decoder = new TextDecoder();
			for (;;) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				// Multibyte characters can split across chunks; `stream: true`
				// keeps the trailing partial sequence for the next decode call.
				assistantContent += decoder.decode(value, { stream: true });
				const nextContent = assistantContent;
				setMessages((prev) =>
					prev.map((message) =>
						message.id === assistantMessage.id
							? { ...message, content: nextContent }
							: message,
					),
				);
			}

			setStatus("idle");
		} catch (error) {
			// The client's own Stop button rejects the fetch with an
			// `AbortError` — that is the expected way to end an in-progress
			// stream, not a failure, so it must never surface as an error.
			if (error instanceof DOMException && error.name === "AbortError") {
				setStatus("idle");
			} else if (assistantContent === "") {
				setMessages((prev) =>
					prev.filter((message) => message.id !== assistantMessage.id),
				);
				setInput(trimmed);
				setStatus("error");
			} else {
				setStatus("error");
			}
		} finally {
			abortControllerRef.current = null;
			textareaRef.current?.focus();
		}
	}

	function handleStop() {
		abortControllerRef.current?.abort();
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			void sendMessage();
		}
	}

	return (
		<div className="flex h-full flex-col gap-4">
			<div className="flex-1 space-y-3 overflow-y-auto rounded-xl bg-white/5 p-4">
				{messages.map((message, index) => (
					<MessageBubble
						isStreaming={
							status === "streaming" &&
							message.role === "assistant" &&
							index === messages.length - 1
						}
						key={message.id}
						message={message}
					/>
				))}
				<div ref={bottomRef} />
			</div>

			{status === "error" && (
				<p className="rounded-md bg-red-500/20 px-4 py-2 text-red-200">
					{ERROR_MESSAGE}
				</p>
			)}

			<div className="flex flex-col gap-2">
				<label className="font-semibold text-sm" htmlFor="chat-input">
					Message
				</label>
				<textarea
					className={`${inputClass} w-full resize-none`}
					id="chat-input"
					onChange={(event) => setInput(event.target.value)}
					onKeyDown={handleKeyDown}
					ref={textareaRef}
					rows={3}
					value={input}
				/>
				<div className="flex gap-3">
					<button
						className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
						disabled={!canSend}
						onClick={() => void sendMessage()}
						type="button"
					>
						Send
					</button>
					<button
						className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
						disabled={status !== "streaming"}
						onClick={handleStop}
						type="button"
					>
						Stop
					</button>
				</div>
			</div>
		</div>
	);
}
