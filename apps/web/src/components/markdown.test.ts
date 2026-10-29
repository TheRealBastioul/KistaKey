import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";
import { parseInline, parseMarkdown, safeHref } from "./markdownParser";

const html = (source: string) => renderToStaticMarkup(createElement(Markdown, { source }));

describe("parseMarkdown: structure", () => {
  it("parses headings, paragraphs and lists", () => {
    const blocks = parseMarkdown(
      "# Title\n\nFirst line\nsame paragraph.\n\n## Part\n\n- one\n- two\n  continued\n\n1. a\n2. b",
    );
    expect(blocks).toEqual([
      { type: "heading", level: 1, children: [{ type: "text", text: "Title" }] },
      { type: "paragraph", children: [{ type: "text", text: "First line same paragraph." }] },
      { type: "heading", level: 2, children: [{ type: "text", text: "Part" }] },
      {
        type: "list",
        ordered: false,
        items: [[{ type: "text", text: "one" }], [{ type: "text", text: "two continued" }]],
      },
      {
        type: "list",
        ordered: true,
        items: [[{ type: "text", text: "a" }], [{ type: "text", text: "b" }]],
      },
    ]);
  });

  it("parses bold, italic, code and links", () => {
    expect(parseInline("**b** *i* _u_ `c` [l](https://example.com/x)")).toEqual([
      { type: "strong", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "i" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "u" }] },
      { type: "text", text: " " },
      { type: "code", text: "c" },
      { type: "text", text: " " },
      {
        type: "link",
        href: "https://example.com/x",
        children: [{ type: "text", text: "l" }],
      },
    ]);
  });

  it("keeps snake_case, unclosed markers and escapes as text", () => {
    expect(parseInline("snake_case_name")).toEqual([{ type: "text", text: "snake_case_name" }]);
    expect(parseInline("2 * 3 and **open")).toEqual([{ type: "text", text: "2 * 3 and **open" }]);
    expect(parseInline("\\*not em\\*")).toEqual([{ type: "text", text: "*not em*" }]);
  });

  it("nests bold inside a link but never a link inside a link", () => {
    const [link] = parseInline("[**a** [b](https://b.example)](https://a.example)");
    expect(link).toMatchObject({ type: "link", href: "https://a.example/" });
    const children = link?.type === "link" ? link.children : [];
    expect(children[0]?.type).toBe("strong");
    expect(children.some((c) => c.type === "link")).toBe(false);
  });

  it("handles CRLF line endings", () => {
    expect(parseMarkdown("# A\r\n\r\ntext")).toHaveLength(2);
  });
});

describe("safeHref: link schemes", () => {
  it.each(["https://example.com", "http://example.com/a?b=c", "mailto:legal@example.com"])(
    "allows %s",
    (url) => {
      expect(safeHref(url)).not.toBeNull();
    },
  );

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "//evil.example/x",
    "/relative",
    "#top",
    "",
  ])("rejects %j", (url) => {
    expect(safeHref(url)).toBeNull();
  });
});

describe("Markdown: XSS payloads render inert", () => {
  const payloads = [
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    '<a href="javascript:alert(1)">x</a>',
    "[click](javascript:alert(1))",
    "[click](JAVASCRIPT:alert(1))",
    "[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[click](vbscript:msgbox(1))",
    '[x](https://ok.example "title" onmouseover=alert(1))',
    "**<svg onload=alert(1)>**",
    "`<iframe src=javascript:alert(1)>`",
    "# <style>body{display:none}</style>",
    "- <object data=javascript:alert(1)>",
  ];

  it.each(payloads)("%s", (payload) => {
    // Escaped source text has no raw "<", so every tag here was made by the renderer.
    const tags = html(payload).match(/<\/?[a-z][^>]*>/gi) ?? [];
    for (const tag of tags) {
      expect(tag).toMatch(/^<\/?(div|p|h[1-6]|ul|ol|li|strong|em|code|a)[\s>]/);
      expect(tag).not.toMatch(/\son\w+=/i);
      expect(tag).not.toMatch(/\shref="(?!https?:|mailto:)/i);
    }
  });

  it("an unsafe link keeps its text and drops the URL", () => {
    const out = html("[click me](javascript:alert(1))");
    expect(out).toContain("click me");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("javascript");
  });

  it("safe links open in a new tab without an opener", () => {
    const out = html("[Privacy](https://example.com/privacy)");
    expect(out).toContain('href="https://example.com/privacy"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });
});
