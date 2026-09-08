import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "@/server/ai/embeddings/types";

const STOPWORDS = new Set(
  "a an the and or but if then else of to in on at for from by with as is are was were be been being this that these those it its into over under about after before between during without within not no yes can could should would will just than too very also which who whom what when where why how all any both each few more most other some such only own same so".split(" "),
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Offline embedding via feature hashing of unigrams + bigrams with TF weighting
 * and L2 normalisation. Not semantic in the neural sense, but deterministic,
 * dependency-free and good enough for keyword-heavy academic retrieval. Swap
 * for a hosted model by implementing EmbeddingProvider.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local-hash";
  readonly dimensions: number;

  constructor(dimensions = 384) {
    this.dimensions = dimensions;
  }

  private bucket(token: string): { index: number; sign: number } {
    const digest = createHash("md5").update(token).digest();
    const index = digest.readUInt32BE(0) % this.dimensions;
    const sign = digest[4]! & 1 ? 1 : -1;
    return { index, sign };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vec = new Array<number>(this.dimensions).fill(0);
      const tokens = tokenize(text);
      const grams = [...tokens, ...tokens.slice(0, -1).map((t, i) => `${t}_${tokens[i + 1]}`)];
      for (const g of grams) {
        const { index, sign } = this.bucket(g);
        vec[index] = (vec[index] ?? 0) + sign;
      }
      // Sub-linear TF then L2 normalise.
      let norm = 0;
      for (let i = 0; i < vec.length; i++) {
        const v = vec[i]!;
        const scaled = Math.sign(v) * Math.log1p(Math.abs(v));
        vec[i] = scaled;
        norm += scaled * scaled;
      }
      norm = Math.sqrt(norm) || 1;
      return vec.map((v) => Math.round((v / norm) * 1e6) / 1e6);
    });
  }
}
