import { env } from "@/lib/env";
import { LocalHashEmbeddingProvider } from "@/server/ai/embeddings/local";
import type { EmbeddingProvider } from "@/server/ai/embeddings/types";

let provider: EmbeddingProvider | undefined;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (provider) return provider;
  switch (env.EMBEDDING_PROVIDER) {
    case "local":
    default:
      provider = new LocalHashEmbeddingProvider();
  }
  return provider;
}

export function setEmbeddingProvider(next: EmbeddingProvider | undefined) {
  provider = next;
}

export { cosineSimilarity } from "@/server/ai/embeddings/types";
export type { EmbeddingProvider } from "@/server/ai/embeddings/types";
