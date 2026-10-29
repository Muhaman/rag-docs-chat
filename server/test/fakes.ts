import { pino } from "pino";
import type { AppDeps } from "../src/app.js";
import type { Embedder } from "../src/embed/embedder.js";
import type { AnswerGenerator } from "../src/rag/answer.js";
import { MemoryVectorStore } from "../src/store/memory.js";

const DIM = 16;

/** Deterministic bag-of-characters embedder: similar text yields similar vectors. */
export class FakeEmbedder implements Embedder {
  readonly dim = DIM;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(DIM).fill(0);
      for (const char of text.toLowerCase()) {
        const slot = char.charCodeAt(0) % DIM;
        vector[slot] = (vector[slot] ?? 0) + 1;
      }
      const norm = Math.hypot(...vector) || 1;
      return vector.map((v) => v / norm);
    });
  }
}

export const idleGenerator: AnswerGenerator = {
  // eslint-disable-next-line require-yield
  async *stream() {
    return;
  },
};

export function makeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    embedder: new FakeEmbedder(),
    store: new MemoryVectorStore(),
    generator: idleGenerator,
    corsOrigins: ["http://localhost:5173"],
    logger: pino({ level: "silent" }),
    ...overrides,
  };
}

/** Builds a minimal valid one-page PDF with correct xref offsets (ASCII text only). */
export function makePdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
