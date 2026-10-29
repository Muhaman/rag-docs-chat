import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { Embedder } from "./embed/embedder.js";
import { errorHandler } from "./errors.js";
import type { Logger } from "./logger.js";
import type { AnswerGenerator } from "./rag/answer.js";
import { chatRouter } from "./routes/chat.js";
import { documentsRouter } from "./routes/documents.js";
import type { VectorStore } from "./store/vectorStore.js";

export interface AppDeps {
  embedder: Embedder;
  store: VectorStore;
  generator: AnswerGenerator;
  corsOrigins: string[];
  logger: Logger;
  /** Requests per minute per client; defaults to 120. */
  rateLimitPerMinute?: number;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    const incoming = req.header("x-request-id");
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    res.setHeader("x-request-id", requestId);
    const startedAt = Date.now();
    res.on("finish", () => {
      deps.logger.info(
        { requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - startedAt },
        "request",
      );
    });
    next();
  });

  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigins }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: deps.rateLimitPerMinute ?? 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({ error: { code: "rate_limited", message: "Too many requests." } });
      },
    }),
  );

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/v1/documents", documentsRouter(deps));
  app.use("/v1/chat", express.json({ limit: "100kb" }), chatRouter(deps));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Route not found." } });
  });
  app.use(errorHandler(deps.logger));
  return app;
}
