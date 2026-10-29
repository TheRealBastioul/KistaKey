// A small, safe Markdown subset for legal documents (and org content later):
// headings, paragraphs, lists, **bold**, *italic*, `code`, [links](url).
// It parses to a tree that Markdown.tsx turns into React elements, so raw
// HTML in the source is always plain text. Links only keep http, https and
// mailto URLs; anything else renders as its text.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Bold inside italic inside a link…: deeper than this is kept as text. */
const MAX_DEPTH = 8;

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,9}[.)]\s+(.*)$/;
const CONTINUATION = /^\s{2,}\S/;

/** The URL if it's absolute http/https/mailto, else null. */
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({
        type: "list",
        ordered: list.ordered,
        items: list.items.map((item) => parseInline(item)),
      });
      list = null;
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = (heading[1] ?? "#").length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: "heading", level, children: parseInline(heading[2] ?? "") });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flushParagraph();
      const ordered = numbered !== null;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item[1] ?? "");
      continue;
    }

    // An indented line right after a list item continues it.
    if (list && CONTINUATION.test(line)) {
      const last = list.items.length - 1;
      list.items[last] = `${list.items[last]} ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** `inLink`: inside a link label, where another link would nest an <a> in an <a>. */
export function parseInline(text: string, depth = 0, inLink = false): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const pushText = (value: string) => {
    buffer += value;
  };
  const flush = () => {
    if (buffer) out.push({ type: "text", text: buffer });
    buffer = "";
  };
  const nested = (inner: string, link = inLink): Inline[] =>
    depth >= MAX_DEPTH ? [{ type: "text", text: inner }] : parseInline(inner, depth + 1, link);

  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;

    if (ch === "\\" && i + 1 < text.length && /[\\`*_[\]()#+\-.!]/.test(text[i + 1] as string)) {
      pushText(text[i + 1] as string);
      i += 2;
      continue;
    }

    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "strong", children: nested(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if ((ch === "*" || ch === "_") && text[i + 1] !== ch && text[i + 1] !== " ") {
      // `_` only at word boundaries, so snake_case stays as it is.
      const opensOk = ch === "*" || !isWordChar(text[i - 1]);
      let end = opensOk ? text.indexOf(ch, i + 1) : -1;
      while (end > 0 && ch === "*" && text[end + 1] === "*") end = text.indexOf(ch, end + 2);
      if (end > i + 1 && text[end - 1] !== " " && (ch === "*" || !isWordChar(text[end + 1]))) {
        flush();
        out.push({ type: "em", children: nested(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "[" && !inLink) {
      const link = matchLink(text, i);
      if (link) {
        flush();
        const children = nested(link.label, true);
        const href = safeHref(link.url);
        if (href) out.push({ type: "link", href, children });
        else out.push(...children);
        i = link.end;
        continue;
      }
    }

    pushText(ch);
    i += 1;
  }
  flush();
  return mergeText(out);
}

/** `[label](url)` starting at `start`: label brackets may nest, the url can't hold spaces or `)`. */
function matchLink(
  text: string,
  start: number,
): { label: string; url: string; end: number } | null {
  let depth = 0;
  let close = -1;
  for (let j = start; j < text.length; j++) {
    const c = text[j];
    if (c === "\\") {
      j += 1;
      continue;
    }
    if (c === "[") depth += 1;
    else if (c === "]") {
      depth -= 1;
      if (depth === 0) {
        close = j;
        break;
      }
    }
  }
  if (close < 0 || text[close + 1] !== "(") return null;
  const urlEnd = text.indexOf(")", close + 2);
  if (urlEnd < 0) return null;
  const url = text.slice(close + 2, urlEnd).trim();
  if (/\s/.test(url)) return null;
  return { label: text.slice(start + 1, close), url, end: urlEnd + 1 };
}

/** Adjacent text nodes (from unsafe links and escapes) become one. */
function mergeText(nodes: Inline[]): Inline[] {
  const merged: Inline[] = [];
  for (const node of nodes) {
    const prev = merged[merged.length - 1];
    if (node.type === "text" && prev?.type === "text") {
      merged[merged.length - 1] = { type: "text", text: prev.text + node.text };
    } else {
      merged.push(node);
    }
  }
  return merged;
}
