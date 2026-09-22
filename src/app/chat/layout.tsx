import { redirect } from "next/navigation";

import { Sidebar } from "~/app/chat/_components/sidebar";
import { getSession } from "~/server/better-auth/server";
import { listConversations } from "~/server/chat/conversations";

/**
 * Wraps both `/chat` and `/chat/[conversationId]`. The session guard is
 * duplicated from the pages on purpose: this layout needs `session.user.id`
 * to list conversations, and a layout that trusted its children to
 * redirect would already have run the query by then.
 *
 * `children` renders its own `<main>`, so this only contributes the flex row
 * and the sidebar — wrapping it in a second `<main>` would nest landmarks.
 *
 * Both mutations in `~/server/chat/actions` end with
 * `revalidatePath("/chat", "layout")`, which is what re-runs
 * `listConversations` here after a rename or delete.
 */
export default async function ChatLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const session = await getSession();
	if (!session) {
		redirect("/?error=Sign%20in%20to%20chat");
	}

	// Already ordered `updatedAt desc` by the repository.
	const conversations = await listConversations(session.user.id);

	return (
		<div className="flex min-h-screen bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
			<Sidebar conversations={conversations} />
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
