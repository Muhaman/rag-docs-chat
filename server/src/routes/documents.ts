import { randomUUID } from "node:crypto";
import { type RequestHandler, Router } from "express";
import multer from "multer";
import type { Embedder } from "../embed/embedder.js";
import { AppError } from "../errors.js";
import { chunkPages } from "../ingest/chunker.js";
import { extractPages } from "../ingest/pdf.js";
import type { DocMeta, VectorStore } from "../store/vectorStore.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const EMBED_BATCH = 32;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isPdf = file.mimetype === "application/pdf" && file.originalname.toLowerCase().endsWith(".pdf");
    if (isPdf) cb(null, true);
    else cb(new AppError(415, "unsupported_media_type", "Only PDF files are supported."));
  },
});

async function embedAll(embedder: Embedder, texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    vectors.push(...(await embedder.embed(texts.slice(i, i + EMBED_BATCH))));
  }
  return vectors;
}

export function documentsRouter(deps: { embedder: Embedder; store: VectorStore }): Router {
  const router = Router();

  const ingest: RequestHandler = async (req, res) => {
    const file = req.file;
    if (!file) throw new AppError(400, "missing_file", "Upload a PDF in the 'file' form field.");
    if (file.size === 0) throw new AppError(400, "empty_file", "The uploaded file is empty.");

    const pages = await extractPages(file.buffer);
    const chunks = chunkPages(pages);
    if (chunks.length === 0) {
      throw new AppError(422, "no_text", "The PDF contains no extractable text.");
    }
    const vectors = await embedAll(
      deps.embedder,
      chunks.map((c) => c.text),
    );
    const id = randomUUID();
    await deps.store.upsert(
      id,
      chunks.map((chunk, i) => ({ ...chunk, vector: vectors[i] ?? [] })),
    );
    const meta: DocMeta = {
      id,
      name: file.originalname,
      pages: pages.length,
      chunks: chunks.length,
      createdAt: new Date().toISOString(),
    };
    await deps.store.addDoc(meta);
    res.status(201).json(meta);
  };

  router.post("/", upload.single("file"), ingest);
  router.get("/", async (_req, res) => {
    res.json(await deps.store.listDocs());
  });
  router.delete("/:id", async (req, res) => {
    await deps.store.deleteDoc(req.params.id);
    res.status(204).end();
  });
  return router;
}
