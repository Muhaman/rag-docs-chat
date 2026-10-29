export interface Embedder {
  dim: number;
  embed(texts: string[]): Promise<number[][]>;
}
