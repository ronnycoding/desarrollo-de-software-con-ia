import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders assistant text as markdown.
 *
 * `react-markdown` builds a React element tree rather than setting
 * `innerHTML`, and raw HTML in the source is inert unless `rehype-raw` is
 * added — which it deliberately is not. Model output is untrusted input, so a
 * `<script>` or `<img onerror>` in a reply must render as visible text, never
 * as markup. The library's default `urlTransform` also drops dangerous
 * protocols such as `javascript:` from links and images. Both protections
 * disappear the moment `rehype-raw` is introduced; do not add it.
 *
 * Partial markdown is expected: this renders on every streamed chunk, so an
 * unclosed fence or half a table arrives routinely. Incomplete syntax simply
 * parses as the text it is so far, and settles once the rest arrives.
 */

/**
 * `mt-3 first:mt-0` rather than a wrapper with `space-y-*`: the wrapper cannot
 * see through to markdown's arbitrarily nested block children, so spacing is
 * applied per element instead.
 */
const block = "mt-3 first:mt-0";

/**
 * In react-markdown v9+ the `code` renderer no longer receives an `inline`
 * prop, so a fenced block and a backtick span reach the same component. The
 * inline pill is styled here and undone for the fenced case from `pre`, which
 * is the only ancestor that can tell them apart.
 */
const inlineCodeClass =
	"rounded bg-black/30 px-1 py-0.5 font-mono text-[0.9em]";
const preCodeReset =
	"[&>code]:block [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit";

const components: Components = {
	a: ({ children, ...props }) => (
		<a
			className="underline underline-offset-2 hover:opacity-80"
			// The destination comes from the model, so it opens detached from
			// this page: `noopener` denies it `window.opener`.
			rel="noopener noreferrer"
			target="_blank"
			{...props}
		>
			{children}
		</a>
	),
	blockquote: ({ children }) => (
		<blockquote className={`${block} border-white/30 border-l-2 pl-3 italic`}>
			{children}
		</blockquote>
	),
	code: ({ children, ...props }) => (
		<code className={inlineCodeClass} {...props}>
			{children}
		</code>
	),
	em: ({ children }) => <em className="italic">{children}</em>,
	h1: ({ children }) => (
		<h1 className={`${block} font-bold text-xl`}>{children}</h1>
	),
	h2: ({ children }) => (
		<h2 className={`${block} font-bold text-lg`}>{children}</h2>
	),
	h3: ({ children }) => (
		<h3 className={`${block} font-semibold text-base`}>{children}</h3>
	),
	hr: () => <hr className={`${block} border-white/20`} />,
	// Markdown images are remote URLs of unknown dimensions and arbitrary host,
	// which `next/image` cannot serve without a configured remote pattern for
	// each one.
	img: ({ alt, ...props }) => (
		// biome-ignore lint/performance/noImgElement: remote markdown image, see above.
		<img
			alt={alt ?? ""}
			className={`${block} max-w-full rounded-lg`}
			loading="lazy"
			{...props}
		/>
	),
	li: ({ children }) => <li className="leading-relaxed">{children}</li>,
	ol: ({ children }) => (
		<ol className={`${block} list-decimal space-y-1 pl-5`}>{children}</ol>
	),
	p: ({ children }) => <p className={`${block} leading-relaxed`}>{children}</p>,
	pre: ({ children }) => (
		<pre
			className={`${block} overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-sm ${preCodeReset}`}
		>
			{children}
		</pre>
	),
	strong: ({ children }) => (
		<strong className="font-semibold">{children}</strong>
	),
	table: ({ children }) => (
		// The wrapper scrolls, not the table, so a wide table cannot stretch the
		// bubble past its `max-w`.
		<div className={`${block} overflow-x-auto`}>
			<table className="w-full border-collapse text-sm">{children}</table>
		</div>
	),
	td: ({ children }) => (
		<td className="border border-white/20 px-2 py-1">{children}</td>
	),
	th: ({ children }) => (
		<th className="border border-white/20 bg-white/10 px-2 py-1 text-left font-semibold">
			{children}
		</th>
	),
	ul: ({ children }) => (
		<ul className={`${block} list-disc space-y-1 pl-5`}>{children}</ul>
	),
};

export function MarkdownMessage({ content }: { content: string }) {
	return (
		<Markdown components={components} remarkPlugins={[remarkGfm]}>
			{content}
		</Markdown>
	);
}
