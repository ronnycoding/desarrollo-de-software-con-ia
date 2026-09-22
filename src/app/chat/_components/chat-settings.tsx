"use client";

import { useActionState, useId, useState } from "react";

import { buttonClass, inputClass } from "~/app/_components/styles";
import { updateSystemPromptAction } from "~/server/chat/actions";

type ChatSettingsProps = {
	conversationId: string;
	/** `null` means the conversation currently falls back to `DEFAULT_SYSTEM_PROMPT`. */
	systemPrompt: string | null;
};

const INITIAL_STATE = { ok: true } as const;

/**
 * Collapsible `<details>`/`<summary>` panel, closed by default so it does not
 * compete with the conversation for attention. `<summary>` is natively
 * keyboard-operable (Enter/Space toggle it) and browsers already expose its
 * expanded state from the `open` attribute, so only `aria-controls` is added
 * by hand — an explicit `aria-expanded` is invalid for the element's role
 * (Biome `useAriaPropsSupportedByRole`) and could drift out of sync with
 * `open`.
 */
export function ChatSettings({
	conversationId,
	systemPrompt,
}: ChatSettingsProps) {
	const panelId = useId();
	const textareaId = useId();
	const [value, setValue] = useState(systemPrompt ?? "");
	const [state, formAction, isPending] = useActionState(
		updateSystemPromptAction,
		INITIAL_STATE,
	);

	return (
		<details className="rounded-xl bg-white/5 p-4">
			<summary aria-controls={panelId} className="cursor-pointer font-semibold">
				Chat settings
			</summary>
			<form
				action={formAction}
				className="mt-4 flex flex-col gap-3"
				id={panelId}
			>
				<input name="conversationId" type="hidden" value={conversationId} />
				<label className="font-semibold text-sm" htmlFor={textareaId}>
					System prompt
				</label>
				<textarea
					className={`${inputClass} w-full resize-none`}
					id={textareaId}
					maxLength={4000}
					name="systemPrompt"
					onChange={(event) => setValue(event.target.value)}
					placeholder="Leave empty to use the default system prompt."
					rows={4}
					value={value}
				/>
				{!state.ok && (
					<p aria-live="polite" className="text-red-300 text-sm">
						{state.error}
					</p>
				)}
				<div className="flex gap-3">
					<button
						className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
						disabled={isPending}
						type="submit"
					>
						Save
					</button>
					<button
						className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
						disabled={isPending}
						onClick={() => setValue(systemPrompt ?? "")}
						type="button"
					>
						Reset
					</button>
				</div>
			</form>
		</details>
	);
}
