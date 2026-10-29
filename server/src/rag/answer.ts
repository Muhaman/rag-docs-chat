import type Anthropic from "@anthropic-ai/sdk";
import { LlmRefusalError, LlmTruncatedError } from "../errors.js";
import type { ScoredChunk, VectorStore } from "../store/vectorStore.js";

export type AnswerEvent =
  | { type: "text"; text: string }
  | { type: "citation"; docId: string; page: number; quote: string };

export interface AnswerGenerator {
  stream(question: string, chunks: ScoredChunk[], signal: AbortSignal): AsyncIterable<AnswerEvent>;
}

const SYSTEM_PROMPT =
  "You answer questions using only the provided documents. " +
  "If the documents do not contain the answer, say so plainly instead of guessing. Be concise.";

const MAX_TOKENS = 16_000;

export class ClaudeAnswerGenerator implements AnswerGenerator {
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    private readonly store: VectorStore,
  ) {}

  async *stream(question: string, chunks: ScoredChunk[], signal: AbortSignal): AsyncIterable<AnswerEvent> {
    const names = new Map((await this.store.listDocs()).map((doc) => [doc.id, doc.name]));
    const documents = chunks.map((chunk) => ({
      type: "document" as const,
      source: { type: "text" as const, media_type: "text/plain" as const, data: chunk.text },
      title: `${names.get(chunk.docId) ?? chunk.docId} p.${chunk.page}`,
      citations: { enabled: true },
    }));

    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [{ role: "user", content: [...documents, { type: "text", text: question }] }],
      },
      { signal },
    );

    let stopReason: string | null = null;
    let refusalCategory: string | null = null;
    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        } else if (event.delta.type === "citations_delta" && event.delta.citation.type === "char_location") {
          const source = chunks[event.delta.citation.document_index];
          if (source) {
            yield { type: "citation", docId: source.docId, page: source.page, quote: event.delta.citation.cited_text };
          }
        }
      } else if (event.type === "message_delta") {
        stopReason = event.delta.stop_reason;
        refusalCategory = event.delta.stop_details?.category ?? null;
      }
    }

    if (stopReason === "refusal") throw new LlmRefusalError(refusalCategory);
    if (stopReason === "max_tokens") throw new LlmTruncatedError();
  }
}
