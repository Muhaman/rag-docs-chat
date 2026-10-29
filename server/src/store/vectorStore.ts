import type { Chunk } from "../ingest/chunker.js";

export type ScoredChunk = Chunk & { docId: string; score: number };

export interface DocMeta {
  id: string;
  name: string;
  pages: number;
  chunks: number;
  createdAt: string;
}

export interface VectorStore {
  upsert(docId: string, chunks: (Chunk & { vector: number[] })[]): Promise<void>;
  search(vector: number[], k: number, docIds?: string[]): Promise<ScoredChunk[]>;
  listDocs(): Promise<DocMeta[]>;
  addDoc(meta: DocMeta): Promise<void>;
  deleteDoc(docId: string): Promise<void>;
}
