/** Application-facing contract for producing vectors; provider protocols belong to Infrastructure. */
export abstract class EmbeddingProvider {
  abstract embed(texts: string[]): Promise<number[][]>

  abstract get modelId(): string
}
