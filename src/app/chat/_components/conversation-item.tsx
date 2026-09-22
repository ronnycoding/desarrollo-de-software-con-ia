"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	type KeyboardEvent,
	useActionState,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

import { buttonClass, inputClass } from "~/app/_components/styles";
import { initialActionState } from "~/server/chat/action-state";
import {
	deleteConversationAction,
	renameConversationAction,
} from "~/server/chat/actions";

type ConversationItemProps = {
	id: string;
	title: string;
};

const UNTITLED = "Untitled conversation";

/**
 * The only client component in the sidebar tree. `Sidebar` stays a server
 * component and never learns the current pathname, so the active item is
 * derived here via `usePathname()` rather than passed down as a prop.
 */
export function ConversationItem({ id, title }: ConversationItemProps) {
	const pathname = usePathname();
	const active = pathname === `/chat/${id}`;
	const href = `/chat/${id}`;
	const displayTitle = title.trim() === "" ? UNTITLED : title;

	const [isRenaming, setIsRenaming] = useState(false);
	const [draftTitle, setDraftTitle] = useState(title);
	const renameInputRef = useRef<HTMLInputElement>(null);
	const renameButtonRef = useRef<HTMLButtonElement>(null);
	const deleteButtonRef = useRef<HTMLButtonElement>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const dialogTitleId = useId();

	const [renameState, renameFormAction, isRenamePending] = useActionState(
		renameConversationAction,
		initialActionState,
	);
	const [deleteState, deleteFormAction, isDeletePending] = useActionState(
		deleteConversationAction,
		initialActionState,
	);

	// Leaves edit mode once the server confirms the rename. A rejected
	// request (e.g. an empty title) leaves `isRenaming` on so the error and
	// the user's draft stay visible.
	useEffect(() => {
		if (isRenaming && renameState.ok) {
			setIsRenaming(false);
		}
	}, [renameState, isRenaming]);

	useEffect(() => {
		if (isRenaming) {
			renameInputRef.current?.focus();
			renameInputRef.current?.select();
		}
	}, [isRenaming]);

	function startRenaming() {
		setDraftTitle(title);
		setIsRenaming(true);
	}

	function cancelRenaming() {
		setIsRenaming(false);
		setDraftTitle(title);
		renameButtonRef.current?.focus();
	}

	function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		// Enter submits natively (it's a single `<input>` inside a `<form>`);
		// only Escape needs a handler here, to cancel without saving.
		if (event.key === "Escape") {
			event.preventDefault();
			cancelRenaming();
		}
	}

	function openDeleteDialog() {
		dialogRef.current?.showModal();
	}

	// `<dialog>` does not restore focus to the invoker on its own; the
	// "close" event (fired for both the Cancel button and native Escape
	// handling) is the one place that covers both, so focus is returned here
	// rather than in each individual close path.
	function handleDialogClose() {
		deleteButtonRef.current?.focus();
	}

	return (
		<li>
			{isRenaming ? (
				<form action={renameFormAction} className="flex flex-col gap-1 p-1">
					<input name="id" type="hidden" value={id} />
					<input
						aria-label="Conversation title"
						className={`${inputClass} py-1 text-sm`}
						disabled={isRenamePending}
						minLength={1}
						name="title"
						onChange={(event) => setDraftTitle(event.target.value)}
						onKeyDown={handleRenameKeyDown}
						ref={renameInputRef}
						required
						value={draftTitle}
					/>
					{!renameState.ok && (
						<p className="text-red-300 text-xs">{renameState.error}</p>
					)}
					<div className="flex gap-2">
						<button
							className="text-white/70 text-xs hover:text-white"
							disabled={isRenamePending}
							type="submit"
						>
							Save
						</button>
						<button
							className="text-white/70 text-xs hover:text-white"
							onClick={cancelRenaming}
							type="button"
						>
							Cancel
						</button>
					</div>
				</form>
			) : (
				<div className="group flex items-center gap-1 rounded-md p-1 hover:bg-white/10">
					<Link
						aria-current={active ? "page" : undefined}
						className={`min-w-0 flex-1 truncate rounded-md px-2 py-1 text-sm ${
							active ? "bg-white/20 font-semibold" : ""
						}`}
						href={href}
					>
						{displayTitle}
					</Link>
					<button
						className="text-white/60 text-xs hover:text-white"
						onClick={startRenaming}
						ref={renameButtonRef}
						type="button"
					>
						Rename
					</button>
					<button
						className="text-white/60 text-xs hover:text-white"
						onClick={openDeleteDialog}
						ref={deleteButtonRef}
						type="button"
					>
						Delete
					</button>
				</div>
			)}

			<dialog
				aria-describedby={deleteState.ok ? undefined : `${dialogTitleId}-error`}
				aria-labelledby={dialogTitleId}
				className="rounded-lg bg-[#1a1230] p-4 text-white backdrop:bg-black/60"
				onClose={handleDialogClose}
				ref={dialogRef}
				role="alertdialog"
			>
				<form action={deleteFormAction} className="flex flex-col gap-3">
					<p className="font-semibold" id={dialogTitleId}>
						Delete "{displayTitle}"?
					</p>
					<p className="text-sm text-white/70">
						This removes the conversation and its messages. This cannot be
						undone.
					</p>
					{!deleteState.ok && (
						<p className="text-red-300 text-xs" id={`${dialogTitleId}-error`}>
							{deleteState.error}
						</p>
					)}
					<input name="id" type="hidden" value={id} />
					<input
						name="active"
						type="hidden"
						value={active ? "true" : "false"}
					/>
					<div className="flex justify-end gap-3">
						<button
							className="text-sm text-white/70 hover:text-white"
							onClick={() => dialogRef.current?.close()}
							type="button"
						>
							Cancel
						</button>
						<button
							className={`${buttonClass} px-4 py-1 text-sm`}
							disabled={isDeletePending}
							type="submit"
						>
							Delete
						</button>
					</div>
				</form>
			</dialog>
		</li>
	);
}
