/**
 * Shared Tailwind classes for form controls and buttons. Extracted from
 * `src/app/page.tsx` so `/chat` can reuse the same look without duplicating
 * the class strings.
 */
export const inputClass =
	"rounded-md bg-white/10 px-4 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[hsl(280,100%,70%)]";
export const buttonClass =
	"rounded-full bg-white/10 px-10 py-3 font-semibold no-underline transition hover:bg-white/20";
