import { describe, expect, it } from "vitest";
import { chunkPages } from "../src/ingest/chunker.js";

const sentence = "The quick brown fox jumps over the lazy dog. ";

describe("chunkPages", () => {
  it("keeps every chunk within maxChars for a 10 000 char page", () => {
    const text = sentence.repeat(Math.ceil(10_000 / sentence.length)).slice(0, 10_000);
    const chunks = chunkPages([{ page: 1, text }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(3200);
  });

  it("keeps chunks within maxChars when the text has no sentence boundaries", () => {
    const chunks = chunkPages([{ page: 1, text: "a".repeat(10_000) }]);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(3200);
  });

  it("starts each chunk with the last 480 chars of the previous one", () => {
    const text = sentence.repeat(Math.ceil(10_000 / sentence.length)).slice(0, 10_000);
    const chunks = chunkPages([{ page: 1, text }]);
    for (let n = 0; n < chunks.length - 1; n++) {
      const tail = chunks[n]!.text.slice(-480);
      expect(chunks[n + 1]!.text.startsWith(tail)).toBe(true);
    }
  });

  it("preserves page numbers across pages and assigns sequential indexes", () => {
    const chunks = chunkPages([
      { page: 1, text: "First page content." },
      { page: 2, text: "Second page content." },
    ]);
    expect(chunks.map((c) => c.page)).toEqual([1, 2]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it("yields no chunks for a blank page", () => {
    expect(chunkPages([{ page: 1, text: "  \n\n  " }])).toEqual([]);
  });

  it("respects custom size options", () => {
    const chunks = chunkPages([{ page: 1, text: sentence.repeat(20) }], {
      maxChars: 200,
      overlapChars: 40,
    });
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(200);
  });
});
