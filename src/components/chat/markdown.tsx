import * as React from "react";

/**
 * Minimal, dependency-free Markdown renderer for AI responses.
 * Supports headings, paragraphs, bold/italic/inline code, fenced code blocks,
 * ordered/unordered lists, blockquotes and links. Output is React elements —
 * never raw HTML — so model output cannot inject markup.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);
  return <div className={className ?? "prose-chat text-sm"}>{blocks.map((b, i) => renderBlock(b, i))}</div>;
}

type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "hr" };

const UL = /^\s*[-*•]\s+/;
const OL = /^\s*\d+[.)]\s+/;
const CONTINUATION = /^\s{2,}\S/;

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const line = (n: number) => lines[n] ?? "";

  while (i < lines.length) {
    const current = line(i);
    if (!current.trim()) {
      i++;
      continue;
    }

    const fence = current.match(/^```(\w*)/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !line(i).startsWith("```")) {
        code.push(line(i));
        i++;
      }
      i++; // closing fence
      blocks.push({ type: "code", lang: fence[1] ?? "", code: code.join("\n") });
      continue;
    }

    const h = current.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push({ type: "h", level: h[1]!.length, text: h[2] ?? "" });
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(current.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    if (UL.test(current) || OL.test(current)) {
      const ordered = OL.test(current);
      const marker = ordered ? OL : UL;
      const items: string[] = [];
      while (i < lines.length && marker.test(line(i))) {
        items.push(line(i).replace(marker, ""));
        i++;
        while (i < lines.length && CONTINUATION.test(line(i)) && !UL.test(line(i)) && !OL.test(line(i))) {
          items[items.length - 1] += ` ${line(i).trim()}`;
          i++;
        }
      }
      blocks.push(ordered ? { type: "ol", items } : { type: "ul", items });
      continue;
    }

    if (current.startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && line(i).startsWith(">")) {
        q.push(line(i).replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", text: q.join(" ") });
      continue;
    }

    const para: string[] = [current];
    i++;
    while (i < lines.length && line(i).trim() && !/^(```|#{1,4}\s|>)/.test(line(i)) && !UL.test(line(i)) && !OL.test(line(i))) {
      para.push(line(i));
      i++;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }
  return blocks;
}

function renderBlock(b: Block, key: number): React.ReactNode {
  switch (b.type) {
    case "h": {
      const Tag = `h${Math.min(3, b.level + 1)}` as "h2" | "h3" | "h4";
      return <Tag key={key}>{renderInline(b.text)}</Tag>;
    }
    case "code":
      return (
        <pre key={key} data-lang={b.lang || undefined}>
          <code>{b.code}</code>
        </pre>
      );
    case "ul":
      return (
        <ul key={key}>
          {b.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key}>
          {b.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote key={key} className="border-l-2 border-brand-300 pl-3 text-muted">
          {renderInline(b.text)}
        </blockquote>
      );
    case "hr":
      return <hr key={key} className="my-3 border-border" />;
    case "p":
    default:
      return <p key={key}>{renderInline(b.text)}</p>;
  }
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE.source, "g");
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const label = tok.slice(1, tok.indexOf("]"));
      out.push(
        <a key={k++} href={m[1]} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
          {label}
        </a>,
      );
    } else out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
