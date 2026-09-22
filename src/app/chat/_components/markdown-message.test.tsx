import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownMessage } from "~/app/chat/_components/markdown-message";

/**
 * Rendered to a string rather than into a DOM: `MarkdownMessage` holds no
 * state and runs no effects, so static markup is enough to assert on and the
 * suite needs no `happy-dom` or `jsdom` setup.
 */
function render(content: string): string {
	return renderToStaticMarkup(<MarkdownMessage content={content} />);
}

describe("MarkdownMessage", () => {
	test("renders markdown as HTML", () => {
		const html = render("**bold** and `code`");
		expect(html).toContain("<strong");
		expect(html).toContain("<code");
		expect(html).toContain("bold");
	});

	test("renders GitHub-flavored tables and strikethrough", () => {
		const html = render("| a |\n| - |\n| 1 |\n\n~~gone~~");
		expect(html).toContain("<table");
		expect(html).toContain("<th");
		expect(html).toContain("<del");
	});

	test("renders fenced code inside a pre", () => {
		const html = render("```js\nconst x = 1;\n```");
		expect(html).toContain("<pre");
		expect(html).toContain("const x = 1;");
	});

	// The security contract: model output is untrusted, so raw HTML in a reply
	// must survive as visible text and never as live markup. These fail the
	// moment someone adds `rehype-raw`.
	test("does not emit raw HTML from the markdown source", () => {
		const html = render('Hello <script>alert("xss")</script> world');
		expect(html).not.toContain("<script");
		expect(html).toContain("&lt;script&gt;");
	});

	test("escapes an inline event handler instead of emitting it", () => {
		const html = render('<img src="x" onerror="alert(1)">');
		// `onerror` still appears — as escaped text the user can read, with no
		// `<img>` element for it to be an attribute of.
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
		expect(html).toContain("onerror=&quot;");
	});

	test("drops a javascript: link target", () => {
		const html = render("[click](javascript:alert(1))");
		expect(html).not.toContain("javascript:");
	});

	test("marks links as external and detached from this page", () => {
		const html = render("[docs](https://example.com)");
		expect(html).toContain('rel="noopener noreferrer"');
		expect(html).toContain('target="_blank"');
	});

	// Every streamed chunk re-renders, so incomplete syntax is the normal case,
	// not an edge case.
	test("renders partial markdown without throwing", () => {
		expect(() => render("```js\nconst x =")).not.toThrow();
		expect(() => render("| a | b |\n| -")).not.toThrow();
		expect(render("")).toBe("");
	});
});
