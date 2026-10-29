import type { Embedder } from "../embed/embedder.js";
import type { ScoredChunk, VectorStore } from "../store/vectorStore.js";

export const RETRIEVAL_K = 6;

export async function retrieve(
  question: string,
  deps: { embedder: Embedder; store: VectorStore },
  docIds?: string[],
): Promise<ScoredChunk[]> {
  const [vector] = await deps.embedder.embed([question]);
  if (!vector) return [];
  return deps.store.search(vector, RETRIEVAL_K, docIds);
}
