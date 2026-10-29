import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { LlmRefusalError } from "../src/errors.js";
import type { AnswerEvent, AnswerGenerator } from "../src/rag/answer.js";
import { MemoryVectorStore } from "../src/store/memory.js";
import { FakeEmbedder, makeDeps } from "./fakes.js";

async function storeWithDoc() {
  const store = new MemoryVectorStore();
  const embedder = new FakeEmbedder();
  const text = "The synthetic Hartwell Mill budget is four hundred thousand credits.";
  const [vector] = await embedder.embed([text]);
  await store.upsert("doc-1", [{ index: 0, page: 3, text, vector: vector! }]);
  await store.addDoc({ id: "doc-1", name: "hartwell.pdf", pages: 3, chunks: 1, createdAt: "2026-01-01T00:00:00.000Z" });
  return store;
}

const ask = (app: ReturnType<typeof createApp>, question = "What is the budget?") =>
  request(app).post("/v1/chat").send({ question }).buffer(true).parse((res, cb) => {
    let data = "";
    res.setEncoding("utf8");
    res.on("data", (c: string) => (data += c));
    res.on("end", () => cb(null, data));
  });

describe("POST /v1/chat", () => {
  it("streams text, citation, then done", async () => {
    const stream = vi.fn(async function* (): AsyncIterable<AnswerEvent> {
      yield { type: "text", text: "Four hundred thousand." };
      yield { type: "citation", docId: "doc-1", page: 3, quote: "four hundred thousand credits" };
    });
    const app = createApp(makeDeps({ store: await storeWithDoc(), generator: { stream } }));
    const res = await ask(app);
    const body = res.body as string;
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(body.indexOf("event: text")).toBeGreaterThanOrEqual(0);
    expect(body.indexOf("event: citation")).toBeGreaterThan(body.indexOf("event: text"));
    expect(body.indexOf("event: done")).toBeGreaterThan(body.indexOf("event: citation"));
    expect(stream).toHaveBeenCalledOnce();
  });

  it("replies without calling the generator when nothing is retrieved", async () => {
    const stream = vi.fn(async function* (): AsyncIterable<AnswerEvent> {
      yield { type: "text", text: "should not happen" };
    });
    const app = createApp(makeDeps({ generator: { stream } }));
    const body = (await ask(app)).body as string;
    expect(body).toContain("event: text");
    expect(body).toContain("No relevant documents");
    expect(body).toContain("event: done");
    expect(stream).not.toHaveBeenCalled();
  });

  it("aborts the generator when the client disconnects", async () => {
    let seen: AbortSignal | undefined;
    const generator: AnswerGenerator = {
      async *stream(_question, _chunks, signal) {
        seen = signal;
        yield { type: "text", text: "partial" };
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      },
    };
    const app = createApp(makeDeps({ store: await storeWithDoc(), generator }));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const controller = new AbortController();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "What is the budget?" }),
        signal: controller.signal,
      });
      await res.body!.getReader().read();
      controller.abort();
      await vi.waitFor(() => expect(seen?.aborted).toBe(true));
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it("emits an error event with code refusal when the model refuses", async () => {
    const generator: AnswerGenerator = {
      // eslint-disable-next-line require-yield
      async *stream() {
        throw new LlmRefusalError("cyber");
      },
    };
    const app = createApp(makeDeps({ store: await storeWithDoc(), generator }));
    const body = (await ask(app)).body as string;
    expect(body).toContain("event: error");
    expect(body).toContain('"code":"refusal"');
    expect(body).not.toContain("event: done");
  });

  it("rejects an invalid body with 400", async () => {
    const res = await request(createApp(makeDeps())).post("/v1/chat").send({ question: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });
});
