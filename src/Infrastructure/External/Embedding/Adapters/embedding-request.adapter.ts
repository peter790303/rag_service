export const createEmbeddingRequestBody = (modelId: string, texts: readonly string[]): string =>
  JSON.stringify({ model: modelId, input: texts })
