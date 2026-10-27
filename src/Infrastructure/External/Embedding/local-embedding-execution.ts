import { Worker } from 'node:worker_threads'

import { readLocalEmbeddingWorkerResult } from './Adapters/local-embedding-worker-protocol.adapter.ts'
import { LocalEmbeddingExecutionException } from './Exceptions/local-embedding-execution.exception.ts'
import { LocalEmbeddingRequestAbortedException } from './Exceptions/local-embedding-request-aborted.exception.ts'
import { LocalEmbeddingRequestTimedOutException } from './Exceptions/local-embedding-request-timed-out.exception.ts'
import { acquireLocalEmbeddingCapacity } from './local-embedding-capacity.ts'

export interface LocalEmbeddingRequest {
  model: string
  revision: string
  cacheDir: string
  texts: string[]
}

/** A request owns its worker: cancellation stops native inference and releases the model. */
export const executeLocalEmbedding = async (
  request: LocalEmbeddingRequest,
  timeoutMs: number,
  signal?: AbortSignal,
  workerUrl = new URL('./local-embedding.worker.js', import.meta.url),
): Promise<unknown> => {
  const deadline = performance.now() + timeoutMs
  const release = await acquireLocalEmbeddingCapacity(timeoutMs, signal)
  try {
    const remainingMs = deadline - performance.now()

    if (signal?.aborted) throw new LocalEmbeddingRequestAbortedException()

    if (remainingMs <= 0) throw new LocalEmbeddingRequestTimedOutException()

    return await executeWorker(request, remainingMs, signal, workerUrl)
  } finally {
    release()
  }
}

const executeWorker = async (
  request: LocalEmbeddingRequest,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  workerUrl: URL,
): Promise<unknown> => {
  if (signal?.aborted) throw new LocalEmbeddingRequestAbortedException()

  // API preloads and entry-point flags belong to the host, not the inference worker.
  let worker: Worker
  try {
    worker = new Worker(workerUrl, {
      workerData: request,
      execArgv: [],
      env: { ...process.env, NODE_OPTIONS: undefined },
    })
  } catch (cause) {
    throw new LocalEmbeddingExecutionException({ cause })
  }
  let timer: NodeJS.Timeout | undefined
  let onAbort: (() => void) | undefined
  try {
    return await new Promise<unknown>((resolve, reject) => {
      onAbort = () => reject(new LocalEmbeddingRequestAbortedException())
      signal?.addEventListener('abort', onAbort, { once: true })

      if (signal?.aborted) onAbort()

      timer = setTimeout(() => reject(new LocalEmbeddingRequestTimedOutException()), timeoutMs)
      worker.once('error', (cause) => reject(new LocalEmbeddingExecutionException({ cause })))
      worker.once('exit', (code) => reject(new LocalEmbeddingExecutionException({ cause: { exitCode: code } })))
      worker.once('message', (message: unknown) => {
        try {
          resolve(readLocalEmbeddingWorkerResult(message))
        } catch (cause) {
          reject(cause)
        }
      })
    })
  } finally {
    clearTimeout(timer)

    if (onAbort) signal?.removeEventListener('abort', onAbort)

    await worker.terminate()
  }
}
