import { unzipSync, strFromU8 } from "fflate";
import { AppError } from "@/lib/errors";

export interface ExtractedText {
  /** Full text; pages separated by \f when known. */
  text: string;
  pageCount: number | null;
  /** True when the format has no extractable text (images) — stored but not indexed. */
  noText?: boolean;
}

export const SUPPORTED_MIME: Record<string, "pdf" | "docx" | "pptx" | "text" | "image"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "text",
  "application/json": "text",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
};

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Resolve a trustworthy MIME type from the browser-provided type and filename. */
export function resolveMimeType(fileName: string, browserType: string | null | undefined): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const fromExt = EXT_TO_MIME[ext];
  if (browserType && SUPPORTED_MIME[browserType]) {
    // Prefer the extension when both are known and disagree (browsers mislabel .md/.csv often).
    return fromExt && fromExt !== browserType && SUPPORTED_MIME[fromExt] === "text" ? fromExt : browserType;
  }
  return fromExt ?? null;
}

/** Cheap magic-byte sanity check so a renamed executable cannot pass as a PDF. */
export function sniffMatches(mime: string, buf: Buffer): boolean {
  const kind = SUPPORTED_MIME[mime];
  if (!kind) return false;
  const head = buf.subarray(0, 8);
  switch (kind) {
    case "pdf":
      return head.subarray(0, 4).toString("latin1") === "%PDF";
    case "docx":
    case "pptx":
      return head[0] === 0x50 && head[1] === 0x4b; // PK zip
    case "image":
      if (mime === "image/png") return head[0] === 0x89 && head[1] === 0x50;
      if (mime === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8;
      if (mime === "image/gif") return head.subarray(0, 3).toString("latin1") === "GIF";
      if (mime === "image/webp") return buf.subarray(8, 12).toString("latin1") === "WEBP";
      return true;
    case "text":
      // Reject NUL bytes in the first KB — not a text file.
      return !buf.subarray(0, 1024).includes(0);
  }
}

export async function extractText(mime: string, buf: Buffer): Promise<ExtractedText> {
  const kind = SUPPORTED_MIME[mime];
  if (!kind) throw new AppError("UNSUPPORTED_FILE", `Unsupported MIME type ${mime}`);

  switch (kind) {
    case "pdf":
      return extractPdf(buf);
    case "docx":
      return extractDocx(buf);
    case "pptx":
      return extractPptx(buf);
    case "text":
      return { text: buf.toString("utf8"), pageCount: null };
    case "image":
      return { text: "", pageCount: null, noText: true };
  }
}

async function extractPdf(buf: Buffer): Promise<ExtractedText> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    const pages = result.pages?.map((p) => p.text) ?? [];
    const text = pages.length ? pages.join("\f") : result.text;
    return { text, pageCount: result.total ?? (pages.length || null) };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocx(buf: Buffer): Promise<ExtractedText> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: buf });
  return { text: result.value, pageCount: null };
}

/** PPTX = zip of XML; pull <a:t> runs from each slide in order. */
async function extractPptx(buf: Buffer): Promise<ExtractedText> {
  const files = unzipSync(new Uint8Array(buf));
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)?.[1]) - Number(b.match(/(\d+)\.xml$/)?.[1]));
  const slides = slideNames.map((name) => {
    const xml = strFromU8(files[name]!);
    const runs = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1] ?? ""));
    // Paragraph boundaries roughly follow </a:p>.
    const paragraphs = xml.split("</a:p>").map((p) => [...p.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1] ?? "")).join(""));
    const text = paragraphs.filter(Boolean).join("\n");
    return text || runs.join(" ");
  });
  return { text: slides.join("\f"), pageCount: slides.length || null };
}

function decodeXml(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
