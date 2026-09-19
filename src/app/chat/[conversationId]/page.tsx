import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ChatPanel } from "~/app/chat/_components/chat-panel";
import { getSession } from "~/server/better-auth/server";
import { getConversation, listMessages } from "~/server/chat/conversations";

export const metadata: Metadata = { title: "Chat" };

type ChatConversationPageProps = {
	// Next 15 route params are always a Promise, even for a page with no
	// parallel/intercepting routes.
	params: Promise<{ conversationId: string }>;
};

export default async function ChatConversationPage({
	params,
}: ChatConversationPageProps) {
	const { conversationId } = await params;

	const session = await getSession();
	if (!session) {
		redirect("/?error=Sign%20in%20to%20chat");
	}

	// `null` covers both a conversation that does not exist and one owned by
	// another user — the repository never distinguishes the two, so neither
	// does this page.
	const conversation = await getConversation(session.user.id, conversationId);
	if (!conversation) {
		notFound();
	}

	const messages = await listMessages(session.user.id, conversationId);

	return (
		<main className="flex min-h-screen flex-col bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
			<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
				<h1 className="font-bold text-3xl">Chat</h1>
				<ChatPanel
					conversationId={conversation.id}
					initialMessages={messages}
				/>
			</div>
		</main>
	);
}
