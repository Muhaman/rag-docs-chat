import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryVectorStore } from "../src/store/memory.js";
import { makeDeps, makePdf } from "./fakes.js";

const upload = (app: ReturnType<typeof createApp>, body: Buffer, filename: string, contentType: string) =>
  request(app).post("/v1/documents").attach("file", body, { filename, contentType });

describe("POST /v1/documents", () => {
  it("rejects non-PDF uploads with 415", async () => {
    const res = await upload(createApp(makeDeps()), Buffer.from("hello"), "notes.txt", "text/plain");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("unsupported_media_type");
  });

  it("rejects files over 10 MB with 413", async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 0x20);
    const res = await upload(createApp(makeDeps()), big, "big.pdf", "application/pdf");
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("file_too_large");
  });

  it("rejects an empty file with 400", async () => {
    const res = await upload(createApp(makeDeps()), Buffer.alloc(0), "empty.pdf", "application/pdf");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("empty_file");
  });

  it("rejects a request without a file with 400", async () => {
    const res = await request(createApp(makeDeps())).post("/v1/documents");
    expect(res.status).toBe(400);
  });

  it("ingests a valid PDF and returns its metadata", async () => {
    const store = new MemoryVectorStore();
    const app = createApp(makeDeps({ store }));
    const pdf = makePdf("Synthetic sample text about the Hartwell Mill renovation budget.");
    const res = await upload(app, pdf, "sample.pdf", "application/pdf");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "sample.pdf", pages: 1 });
    expect(res.body.chunks).toBeGreaterThan(0);
    expect(await store.listDocs()).toHaveLength(1);
  });
});

describe("GET and DELETE /v1/documents", () => {
  it("lists and deletes documents", async () => {
    const app = createApp(makeDeps());
    const created = await upload(app, makePdf("Some searchable synthetic text."), "a.pdf", "application/pdf");
    const list = await request(app).get("/v1/documents");
    expect(list.body).toHaveLength(1);
    const del = await request(app).delete(`/v1/documents/${created.body.id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get("/v1/documents")).body).toEqual([]);
  });
});
