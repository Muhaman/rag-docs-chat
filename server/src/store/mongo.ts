import { type Collection, MongoClient } from "mongodb";
import type { Chunk } from "../ingest/chunker.js";
import type { DocMeta, ScoredChunk, VectorStore } from "./vectorStore.js";

const INDEX_NAME = "chunk_vector_index";
const CANDIDATE_FACTOR = 20;

interface ChunkDoc extends Chunk {
  docId: string;
  vector: number[];
}

type DocRecord = Omit<DocMeta, "id"> & { _id: string };

export class MongoVectorStore implements VectorStore {
  private constructor(
    private readonly client: MongoClient,
    private readonly chunks: Collection<ChunkDoc>,
    private readonly docs: Collection<DocRecord>,
  ) {}

  /** Connects, creates the collections and the vector search index if missing. */
  static async connect(uri: string, dbName: string, dimensions: number): Promise<MongoVectorStore> {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    if ((await db.listCollections({ name: "chunks" }, { nameOnly: true }).toArray()).length === 0) {
      await db.createCollection("chunks");
    }
    const chunks = db.collection<ChunkDoc>("chunks");
    await chunks.createIndex({ docId: 1 });
    if ((await chunks.listSearchIndexes(INDEX_NAME).toArray()).length === 0) {
      await chunks.createSearchIndex({
        name: INDEX_NAME,
        type: "vectorSearch",
        definition: {
          fields: [
            { type: "vector", path: "vector", numDimensions: dimensions, similarity: "cosine" },
            { type: "filter", path: "docId" },
          ],
        },
      });
    }
    return new MongoVectorStore(client, chunks, db.collection<DocRecord>("documents"));
  }

  async upsert(docId: string, chunks: (Chunk & { vector: number[] })[]): Promise<void> {
    await this.chunks.deleteMany({ docId });
    if (chunks.length > 0) await this.chunks.insertMany(chunks.map((chunk) => ({ ...chunk, docId })));
  }

  async search(vector: number[], k: number, docIds?: string[]): Promise<ScoredChunk[]> {
    const rows = await this.chunks
      .aggregate<ScoredChunk>([
        {
          $vectorSearch: {
            index: INDEX_NAME,
            path: "vector",
            queryVector: vector,
            numCandidates: k * CANDIDATE_FACTOR,
            limit: k,
            ...(docIds ? { filter: { docId: { $in: docIds } } } : {}),
          },
        },
        {
          $project: { _id: 0, docId: 1, index: 1, page: 1, text: 1, score: { $meta: "vectorSearchScore" } },
        },
      ])
      .toArray();
    return rows;
  }

  async listDocs(): Promise<DocMeta[]> {
    const records = await this.docs.find().sort({ createdAt: -1 }).toArray();
    return records.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  }

  async addDoc({ id, ...rest }: DocMeta): Promise<void> {
    await this.docs.insertOne({ _id: id, ...rest });
  }

  async deleteDoc(docId: string): Promise<void> {
    await this.chunks.deleteMany({ docId });
    await this.docs.deleteOne({ _id: docId });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
