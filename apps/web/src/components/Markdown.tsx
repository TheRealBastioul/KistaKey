// Renders markdownParser.ts's tree as React elements. Never dangerouslySetInnerHTML:
// every string ends up as a text node, so HTML in the source stays inert.
// (Not "markdown.ts": Windows paths are case-insensitive, so "./Markdown"
// would resolve to it.)
import { type ReactNode, useMemo } from "react";
import { type Block, type Inline, parseMarkdown } from "./markdownParser";

const HEADING_STYLES = {
  1: "text-2xl font-semibold",
  2: "mt-2 text-lg font-semibold",
  3: "text-base font-semibold",
  4: "text-sm font-semibold",
  5: "text-sm font-semibold",
  6: "text-sm font-semibold text-muted",
} as const;

function InlineNode({ node }: { node: Inline }): ReactNode {
  switch (node.type) {
    case "text":
      return node.text;
    case "strong":
      return <strong>{renderInline(node.children)}</strong>;
    case "em":
      return <em>{renderInline(node.children)}</em>;
    case "code":
      return <code className="rounded bg-bg px-1 font-mono text-[0.9em]">{node.text}</code>;
    case "link":
      return (
        <a
          href={node.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-accent underline-offset-2 hover:underline"
        >
          {renderInline(node.children)}
        </a>
      );
  }
}

function renderInline(nodes: Inline[]): ReactNode[] {
  // Parsed static text: a node has no identity beyond its position.
  // biome-ignore lint/suspicious/noArrayIndexKey: static content, never reordered
  return nodes.map((node, i) => <InlineNode key={i} node={node} />);
}

function renderBlock(block: Block, i: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as const;
      return (
        <Tag key={i} className={HEADING_STYLES[block.level]}>
          {renderInline(block.children)}
        </Tag>
      );
    }
    case "paragraph":
      return <p key={i}>{renderInline(block.children)}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={i} className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
          {block.items.map((item, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static content, never reordered
            <li key={j}>{renderInline(item)}</li>
          ))}
        </Tag>
      );
    }
  }
}

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={`flex flex-col gap-3 text-sm ${className}`}>{blocks.map(renderBlock)}</div>
  );
}
