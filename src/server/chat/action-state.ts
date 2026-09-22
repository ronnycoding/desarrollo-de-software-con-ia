/**
 * Result shape for every action in `./actions`, consumed by `useActionState`
 * on the client. Kept as a plain discriminated union (not a thrown error) so
 * a rejected rename/delete can render inline without an error boundary.
 *
 * This lives outside `actions.ts` because that file carries a top-level
 * `"use server"`, and such a module may only export async functions —
 * `initialActionState` is a value, so it cannot be exported from there.
 */
export type ActionState = { ok: true } | { ok: false; error: string };

export const initialActionState: ActionState = { ok: true };
