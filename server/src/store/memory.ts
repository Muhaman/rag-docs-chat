import type { Chunk } from "../ingest/chunker.js";
import type { DocMeta, ScoredChunk, VectorStore } from "./vectorStore.js";

type StoredChunk = Chunk & { vector: number[] };

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** In-process store for tests and local experiments; brute-force cosine search. */
export class MemoryVectorStore implements VectorStore {
  private readonly chunks = new Map<string, StoredChunk[]>();
  private readonly docs = new Map<string, DocMeta>();

  async upsert(docId: string, chunks: StoredChunk[]): Promise<void> {
    this.chunks.set(docId, chunks);
  }

  async search(vector: number[], k: number, docIds?: string[]): Promise<ScoredChunk[]> {
    const scored: ScoredChunk[] = [];
    for (const [docId, chunks] of this.chunks) {
      if (docIds && !docIds.includes(docId)) continue;
      for (const { vector: stored, ...chunk } of chunks) {
        scored.push({ ...chunk, docId, score: cosine(vector, stored) });
      }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }

  async listDocs(): Promise<DocMeta[]> {
    return [...this.docs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addDoc(meta: DocMeta): Promise<void> {
    this.docs.set(meta.id, meta);
  }

  async deleteDoc(docId: string): Promise<void> {
    this.chunks.delete(docId);
    this.docs.delete(docId);
  }
}
