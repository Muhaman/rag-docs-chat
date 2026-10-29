import { describe, expect, it } from "vitest";
import { MemoryVectorStore } from "../src/store/memory.js";

async function seeded() {
  const store = new MemoryVectorStore();
  await store.upsert("a", [
    { index: 0, page: 1, text: "[1,0]", vector: [1, 0] },
    { index: 1, page: 1, text: "[0,1]", vector: [0, 1] },
    { index: 2, page: 2, text: "[0.9,0.1]", vector: [0.9, 0.1] },
  ]);
  await store.upsert("b", [{ index: 0, page: 1, text: "other [1,0]", vector: [1, 0] }]);
  return store;
}

describe("MemoryVectorStore", () => {
  it("returns the nearest chunks by cosine similarity in order", async () => {
    const store = new MemoryVectorStore();
    await store.upsert("a", [
      { index: 0, page: 1, text: "[1,0]", vector: [1, 0] },
      { index: 1, page: 1, text: "[0,1]", vector: [0, 1] },
      { index: 2, page: 1, text: "[0.9,0.1]", vector: [0.9, 0.1] },
    ]);
    const hits = await store.search([1, 0], 2);
    expect(hits.map((h) => h.text)).toEqual(["[1,0]", "[0.9,0.1]"]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("restricts results to the given docIds", async () => {
    const store = await seeded();
    const hits = await store.search([1, 0], 10, ["b"]);
    expect(hits.map((h) => h.docId)).toEqual(["b"]);
  });

  it("removes chunks and metadata when a document is deleted", async () => {
    const store = await seeded();
    await store.addDoc({ id: "a", name: "a.pdf", pages: 2, chunks: 3, createdAt: "2026-01-01T00:00:00.000Z" });
    await store.deleteDoc("a");
    expect(await store.listDocs()).toEqual([]);
    const hits = await store.search([1, 0], 10);
    expect(hits.every((h) => h.docId !== "a")).toBe(true);
  });
});
