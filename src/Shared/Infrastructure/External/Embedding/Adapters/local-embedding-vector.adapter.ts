import { LocalEmbeddingTokenWindowCapacityException } from '../Exceptions/local-embedding-token-window-capacity.exception.ts'
import { LocalEmbeddingVectorMagnitudeException } from '../Exceptions/local-embedding-vector-magnitude.exception.ts'
import { LocalEmbeddingWindowVectorsException } from '../Exceptions/local-embedding-window-vectors.exception.ts'

export const createTokenWindows = (tokens: number[], capacity: number): number[][] => {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new LocalEmbeddingTokenWindowCapacityException()

  return Array.from({ length: Math.max(1, Math.ceil(tokens.length / capacity)) }, (_, index) =>
    tokens.slice(index * capacity, (index + 1) * capacity),
  )
}

export const poolWindowVectors = (windows: { vector: number[]; weight: number }[]): number[] => {
  const dimensions = windows[0]?.vector.length ?? 0

  if (
    !dimensions ||
    windows.some(
      ({ vector, weight }) =>
        vector.length !== dimensions ||
        !Number.isFinite(weight) ||
        weight <= 0 ||
        vector.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new LocalEmbeddingWindowVectorsException()
  }

  const totalWeight = windows.reduce((total, window) => total + window.weight, 0)
  const pooled = Array.from({ length: dimensions }, (_, index) =>
    windows.reduce((total, window) => total + ((window.vector[index] ?? 0) * window.weight) / totalWeight, 0),
  )
  const magnitude = Math.hypot(...pooled)

  if (!Number.isFinite(magnitude) || magnitude === 0) throw new LocalEmbeddingVectorMagnitudeException()

  return pooled.map((value) => value / magnitude)
}
