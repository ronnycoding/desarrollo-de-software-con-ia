import Link from "next/link";

import { buttonClass } from "~/app/_components/styles";
import { ConversationItem } from "~/app/chat/_components/conversation-item";
import type { Conversation } from "~/server/chat/conversations";

type SidebarConversation = Pick<Conversation, "id" | "title" | "updatedAt">;

type SidebarProps = {
	conversations: SidebarConversation[];
};

/**
 * Server component: `conversations` arrives already loaded (and already
 * ordered `updatedAt desc` by `listConversations`) from `layout.tsx`, so
 * there is no client fetch or loading state here. `ConversationItem` is the
 * only client piece — it needs `usePathname()` for the active item and
 * `useActionState` for rename/delete.
 */
export function Sidebar({ conversations }: SidebarProps) {
	return (
		<aside className="flex w-72 shrink-0 flex-col gap-4 border-white/10 border-r bg-white/5 p-4">
			<Link className={buttonClass} href="/chat">
				Nueva conversación
			</Link>
			<nav
				aria-label="Conversaciones"
				className="min-h-0 flex-1 overflow-y-auto"
			>
				<ul className="flex flex-col gap-1">
					{conversations.map((conversation) => (
						<ConversationItem
							id={conversation.id}
							key={conversation.id}
							title={conversation.title ?? ""}
						/>
					))}
				</ul>
			</nav>
		</aside>
	);
}
