import { Router, type Response } from "express";
import { z } from "zod";
import type { Embedder } from "../embed/embedder.js";
import { toErrorBody } from "../errors.js";
import type { Logger } from "../logger.js";
import type { AnswerGenerator } from "../rag/answer.js";
import { retrieve } from "../rag/retrieve.js";
import type { VectorStore } from "../store/vectorStore.js";

const body = z.object({
  question: z.string().min(1).max(2000),
  docIds: z.array(z.string().min(1)).max(50).optional(),
});

export const NO_DOCS_MESSAGE = "No relevant documents were found. Upload a PDF and try again.";

function send(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function chatRouter(deps: {
  embedder: Embedder;
  store: VectorStore;
  generator: AnswerGenerator;
  logger: Logger;
}): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const { question, docIds } = body.parse(req.body);

    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    try {
      const chunks = await retrieve(question, deps, docIds?.length ? docIds : undefined);
      if (chunks.length === 0) {
        send(res, "text", { text: NO_DOCS_MESSAGE });
      } else {
        for await (const event of deps.generator.stream(question, chunks, controller.signal)) {
          if (event.type === "text") send(res, "text", { text: event.text });
          else send(res, "citation", { docId: event.docId, page: event.page, quote: event.quote });
        }
      }
      if (!controller.signal.aborted) send(res, "done", {});
    } catch (err) {
      if (!controller.signal.aborted) {
        const { status, body: errorBody } = toErrorBody(err);
        if (status >= 500) deps.logger.error({ err }, "chat stream failed");
        send(res, "error", errorBody.error);
      }
    } finally {
      res.end();
    }
  });

  return router;
}
