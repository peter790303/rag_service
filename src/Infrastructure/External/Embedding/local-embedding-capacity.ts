import { LocalEmbeddingRequestAbortedException } from './Exceptions/local-embedding-request-aborted.exception.ts'
import { LocalEmbeddingRequestTimedOutException } from './Exceptions/local-embedding-request-timed-out.exception.ts'

// Each worker loads a full native model. Hold capacity until its termination completes.
let occupied = false
const waiting = new Set<() => void>()

const release = (): void => {
  const next = waiting.values().next().value

  if (next) next()
  else occupied = false
}

export const acquireLocalEmbeddingCapacity = async (timeoutMs: number, signal?: AbortSignal): Promise<() => void> => {
  if (signal?.aborted) throw new LocalEmbeddingRequestAbortedException()

  if (timeoutMs <= 0) throw new LocalEmbeddingRequestTimedOutException()

  if (!occupied) {
    occupied = true

    return release
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      waiting.delete(onAvailable)
    }
    const onAvailable = (): void => {
      cleanup()
      resolve(release)
    }
    const onAbort = (): void => {
      cleanup()
      reject(new LocalEmbeddingRequestAbortedException())
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new LocalEmbeddingRequestTimedOutException())
    }, timeoutMs)
    waiting.add(onAvailable)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
