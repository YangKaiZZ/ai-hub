import { describe, expect, it } from "vitest";
import { chunkText } from "@/server/documents/chunk";

const para = (n: number, words = 60) => Array.from({ length: words }, (_, i) => `word${n}_${i}`).join(" ") + ".";

describe("chunkText", () => {
  it("returns nothing for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n ")).toEqual([]);
  });

  it("keeps short documents as a single chunk", () => {
    const chunks = chunkText("Hello world.\n\nSecond paragraph.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.index).toBe(0);
    expect(chunks[0]!.content).toContain("Second paragraph");
  });

  it("splits long text into overlapping chunks near the target size", () => {
    const text = Array.from({ length: 12 }, (_, i) => para(i)).join("\n\n");
    const chunks = chunkText(text, { targetChars: 1200, overlapChars: 150, minChars: 100 });
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(1200 + 100);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    // Overlap: the start of chunk 2 should appear near the end of chunk 1.
    const head = chunks[1]!.content.slice(0, 40);
    expect(chunks[0]!.content.includes(head.split(" ")[0]!)).toBe(true);
  });

  it("attributes page numbers from form-feed page breaks", () => {
    const text = `${para(1, 30)}\f${para(2, 30)}\f${para(3, 30)}`;
    const chunks = chunkText(text, { targetChars: 300, overlapChars: 0, minChars: 50 });
    expect(chunks[0]!.page).toBe(1);
    expect(chunks[chunks.length - 1]!.page).toBe(3);
  });

  it("hard-splits a single oversized paragraph", () => {
    const text = para(9, 800);
    const chunks = chunkText(text, { targetChars: 1000, overlapChars: 0, minChars: 50 });
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.tokenCount > 0)).toBe(true);
  });
});
