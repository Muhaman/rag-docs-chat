import { env, pipeline } from "@huggingface/transformers";
import type { Embedder } from "./embedder.js";

const MODEL = "Xenova/all-MiniLM-L6-v2";

type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/** Runs all-MiniLM-L6-v2 locally via transformers.js; the model loads lazily on first use. */
export class LocalEmbedder implements Embedder {
  readonly dim = 384;
  private extractor?: Promise<Extractor>;

  constructor(cacheDir: string) {
    env.cacheDir = cacheDir;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const extract = await this.load();
    const output = await extract(texts, { pooling: "mean", normalize: true });
    return output.tolist();
  }

  private load(): Promise<Extractor> {
    this.extractor ??= (pipeline("feature-extraction", MODEL) as unknown as Promise<Extractor>).catch(
      (err: unknown) => {
        this.extractor = undefined;
        throw err;
      },
    );
    return this.extractor;
  }
}
