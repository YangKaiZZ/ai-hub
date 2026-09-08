import { estimateTokens } from "@/lib/utils";

export interface TextChunk {
  index: number;
  content: string;
  tokenCount: number;
  page: number | null;
}

export interface ChunkOptions {
  /** Target size in characters (~4 chars per token). */
  targetChars?: number;
  overlapChars?: number;
  minChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = { targetChars: 2800, overlapChars: 300, minChars: 200 };

/**
 * Paragraph-aware chunker. Input may include `\f` page breaks (from PDF
 * extraction) which are used to attribute a page number to each chunk.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const opts = { ...DEFAULTS, ...options };
  const normalized = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];

  // Split into paragraphs while tracking page numbers via form feeds.
  const units: { text: string; page: number | null }[] = [];
  const hasPages = normalized.includes("\f");
  let page = hasPages ? 1 : null;
  for (const pagePart of normalized.split("\f")) {
    for (const para of pagePart.split(/\n\s*\n/)) {
      const p = para.trim();
      if (p) units.push({ text: p, page });
    }
    if (page != null) page += 1;
  }

  const chunks: TextChunk[] = [];
  let buffer = "";
  let bufferPage: number | null = null;

  const flush = () => {
    const content = buffer.trim();
    if (content.length >= opts.minChars || (chunks.length === 0 && content.length > 0)) {
      chunks.push({ index: chunks.length, content, tokenCount: estimateTokens(content), page: bufferPage });
    } else if (content.length > 0 && chunks.length > 0) {
      // Merge tiny tail into the previous chunk.
      const prev = chunks[chunks.length - 1]!;
      prev.content = `${prev.content}\n\n${content}`;
      prev.tokenCount = estimateTokens(prev.content);
    }
    buffer = "";
    bufferPage = null;
  };

  for (const unit of units) {
    // Very long paragraph: hard-split by sentences.
    const pieces = unit.text.length > opts.targetChars ? splitLong(unit.text, opts.targetChars) : [unit.text];
    for (const piece of pieces) {
      if (buffer.length + piece.length + 2 > opts.targetChars && buffer.length > 0) {
        const tail = buffer.slice(-opts.overlapChars);
        flush();
        buffer = tail.includes(" ") ? tail.slice(tail.indexOf(" ") + 1) : "";
        bufferPage = unit.page;
      }
      if (!bufferPage) bufferPage = unit.page;
      buffer = buffer ? `${buffer}\n\n${piece}` : piece;
    }
  }
  flush();
  return chunks;
}

function splitLong(text: string, max: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur.length + s.length + 1 > max && cur) {
      out.push(cur);
      cur = "";
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
      continue;
    }
    cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}
