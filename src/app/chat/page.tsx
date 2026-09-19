import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ChatPanel } from "~/app/chat/_components/chat-panel";
import { getSession } from "~/server/better-auth/server";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage() {
	const session = await getSession();
	if (!session) {
		redirect("/?error=Sign%20in%20to%20chat");
	}

	return (
		<main className="flex min-h-screen flex-col bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
			<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
				<h1 className="font-bold text-3xl">Chat</h1>
				<ChatPanel />
			</div>
		</main>
	);
}
