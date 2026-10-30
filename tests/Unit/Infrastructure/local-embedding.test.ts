import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { mapEmbeddingResponse } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/Adapters/embedding-response.adapter.ts'
import {
  createTokenWindows,
  poolWindowVectors,
} from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/Adapters/local-embedding-vector.adapter.ts'
import { LocalEmbeddingExecutionException } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/Exceptions/local-embedding-execution.exception.ts'
import { LocalEmbeddingRequestAbortedException } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/Exceptions/local-embedding-request-aborted.exception.ts'
import { LocalEmbeddingRequestTimedOutException } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/Exceptions/local-embedding-request-timed-out.exception.ts'
import { LocalEmbeddingSpecialTokensUnsupportedException } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/Exceptions/local-embedding-special-tokens-unsupported.exception.ts'
import { LocalEmbeddingTokenWindowCapacityException } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/Exceptions/local-embedding-token-window-capacity.exception.ts'
import { LocalEmbeddingTokenizerUnsupportedException } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/Exceptions/local-embedding-tokenizer-unsupported.exception.ts'
import { LocalEmbeddingVectorMagnitudeException } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/Exceptions/local-embedding-vector-magnitude.exception.ts'
import { LocalEmbeddingWindowVectorsException } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/Exceptions/local-embedding-window-vectors.exception.ts'
import { acquireLocalEmbeddingCapacity } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/local-embedding-capacity.ts'
import { executeLocalEmbedding } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/local-embedding-execution.ts'
import { LocalEmbeddingClient } from '../../../src/DocumentIndexes/Infrastructure/External/Embedding/local-embedding.client.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/KnowledgeBases/Application/Exceptions/knowledge-embedding-unavailable.exception.ts'

const request = { model: 'original/model', revision: 'pinned', cacheDir: '/unused', texts: ['first'] }
const workerUrl = new URL('../../Support/local-embedding-worker.fixture.js', import.meta.url)

test('queued inference expires or aborts without starting a worker and subsequent requests recover', async () => {
  const release = await acquireLocalEmbeddingCapacity(5000)
  const invalidWorkerUrl = new URL('https://invalid.example/worker.js')
  const controller = new AbortController()
  try {
    const aborted = executeLocalEmbedding(request, 5000, controller.signal, invalidWorkerUrl)
    const assertion = assert.rejects(aborted, LocalEmbeddingRequestAbortedException)
    controller.abort()
    await assertion
    await assert.rejects(
      executeLocalEmbedding(request, 20, undefined, invalidWorkerUrl),
      LocalEmbeddingRequestTimedOutException,
    )
  } finally {
    release()
  }
  assert.deepEqual(await executeLocalEmbedding(request, 5000, undefined, workerUrl), [[1, 0]])
})

test('embedding capacity admits one request at a time in arrival order', async () => {
  const releaseFirst = await acquireLocalEmbeddingCapacity(5000)
  const admitted: number[] = []
  const second = acquireLocalEmbeddingCapacity(5000).then((release) => {
    admitted.push(2)

    return release
  })
  const third = acquireLocalEmbeddingCapacity(5000).then((release) => {
    admitted.push(3)

    return release
  })
  assert.deepEqual(admitted, [])
  releaseFirst()
  const releaseSecond = await second
  assert.deepEqual(admitted, [2])
  releaseSecond()
  const releaseThird = await third
  assert.deepEqual(admitted, [2, 3])
  releaseThird()
})

test('inference workers do not inherit host entry-point flags or NODE_OPTIONS preloads', async () => {
  const executionUrl = new URL(
    '../../../src/DocumentIndexes/Infrastructure/External/Embedding/local-embedding-execution.js',
    import.meta.url,
  )
  const preloadUrl = new URL('../../Support/local-embedding-host-preload.fixture.js', import.meta.url)
  const script = `import { executeLocalEmbedding } from ${JSON.stringify(executionUrl.href)};
    const vectors = await executeLocalEmbedding(${JSON.stringify(request)}, 5000, undefined, new URL(${JSON.stringify(workerUrl.href)}));
    console.log(JSON.stringify(vectors));`
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], {
    env: { ...process.env, NODE_OPTIONS: `--import=${fileURLToPath(preloadUrl)}` },
    timeout: 10000,
  })
  assert.deepEqual(JSON.parse(stdout), [[1, 0]])
})

test('token windows cover the entire input once, including the tail and empty text', () => {
  const tokens = Array.from({ length: 1023 }, (_, index) => index)
  const windows = createTokenWindows(tokens, 510)
  assert.deepEqual(
    windows.map((window) => window.length),
    [510, 510, 3],
  )
  assert.deepEqual(windows.flat(), tokens)
  assert.deepEqual(createTokenWindows([], 510), [[]])
  assert.throws(() => createTokenWindows(tokens, 0), {
    name: 'LocalEmbeddingTokenWindowCapacityException',
    code: 'LOCAL_EMBEDDING_TOKEN_WINDOW_CAPACITY_INVALID',
  })
})

test('window vectors use token weights before final normalization', () => {
  const vector = poolWindowVectors([
    { vector: [1, 0], weight: 3 },
    { vector: [0, 1], weight: 4 },
  ])
  assert.ok(Math.abs(vector[0]! - 0.6) < 1e-12)
  assert.ok(Math.abs(vector[1]! - 0.8) < 1e-12)
  assert.deepEqual(poolWindowVectors([{ vector: [3, 4], weight: 1 }]), [0.6, 0.8])
  assert.throws(() => poolWindowVectors([{ vector: [0, 0], weight: 1 }]), LocalEmbeddingVectorMagnitudeException)
  assert.throws(() => poolWindowVectors([{ vector: [NaN, 1], weight: 1 }]), LocalEmbeddingWindowVectorsException)
  assert.throws(
    () =>
      poolWindowVectors([
        { vector: [1], weight: 1 },
        { vector: [1, 2], weight: 1 },
      ]),
    LocalEmbeddingWindowVectorsException,
  )
})

test('worker completion returns vectors and external failures retain their diagnostic cause', async () => {
  assert.deepEqual(await executeLocalEmbedding(request, 5000, undefined, workerUrl), [[1, 0]])
  await assert.rejects(
    executeLocalEmbedding({ ...request, texts: ['failure'] }, 5000, undefined, workerUrl),
    (cause: unknown) => {
      assert.ok(cause instanceof LocalEmbeddingExecutionException)
      assert.equal(cause.code, 'LOCAL_EMBEDDING_EXECUTION_FAILED')
      assert.equal(cause.message, 'Local embedding worker execution failed')
      assert.equal((cause.cause as { name: string }).name, 'TypeError')
      assert.equal((cause.cause as { message: string }).message, 'Inference failed')

      return true
    },
  )
  await assert.rejects(
    executeLocalEmbedding({ ...request, texts: ['crash'] }, 5000, undefined, workerUrl),
    (cause: unknown) => {
      assert.ok(cause instanceof LocalEmbeddingExecutionException)
      assert.ok(cause.cause instanceof Error)
      assert.equal(cause.cause.message, 'Native worker crashed')

      return true
    },
  )
  await assert.rejects(
    executeLocalEmbedding({ ...request, texts: ['exit'] }, 5000, undefined, workerUrl),
    (cause: unknown) => {
      assert.ok(cause instanceof LocalEmbeddingExecutionException)
      assert.deepEqual(cause.cause, { exitCode: 1 })

      return true
    },
  )
})

test('timeout and caller abort terminate a stalled embedding worker', async () => {
  await assert.rejects(
    executeLocalEmbedding({ ...request, texts: ['stall'] }, 30, undefined, workerUrl),
    LocalEmbeddingRequestTimedOutException,
  )
  const controller = new AbortController()
  const pending = executeLocalEmbedding({ ...request, texts: ['stall'] }, 5000, controller.signal, workerUrl)
  controller.abort()
  await assert.rejects(pending, LocalEmbeddingRequestAbortedException)
  await assert.rejects(
    executeLocalEmbedding(request, 5000, controller.signal, workerUrl),
    LocalEmbeddingRequestAbortedException,
  )
})

test('local model identity pins revision and full text inference, and empty input needs no worker', async () => {
  const client = new LocalEmbeddingClient({
    embeddingModel: 'original/model',
    embeddingRevision: 'pinned',
    embeddingCacheDir: '/unused',
    embeddingDimensions: 2,
    externalRequestTimeoutMs: 5000,
  })
  assert.equal(client.modelId, 'original/model@pinned:cpu:q8:mean:normalize:full-text-v1')
  assert.deepEqual(await client.embed([]), [])
})

test('embedding boundary rejects zero, nonfinite and dimension-mismatched vectors', () => {
  assert.throws(() => mapEmbeddingResponse({ data: [{ embedding: [0, 0] }] }, 1, 2))
  assert.throws(() => mapEmbeddingResponse({ data: [{ embedding: [Infinity, 1] }] }, 1, 2))
  assert.throws(() => mapEmbeddingResponse({ data: [{ embedding: [1] }] }, 1, 2))
})

test('local embedding wraps caller cancellation in the existing availability contract', async () => {
  const client = new LocalEmbeddingClient({
    embeddingModel: 'original/model',
    embeddingRevision: 'pinned',
    embeddingCacheDir: '/unused',
    embeddingDimensions: 2,
    externalRequestTimeoutMs: 5000,
  })
  await assert.rejects(client.embed(['text'], AbortSignal.abort()), (cause: unknown) => {
    assert.ok(cause instanceof KnowledgeEmbeddingUnavailableException)
    assert.ok(cause.cause instanceof LocalEmbeddingRequestAbortedException)

    return true
  })
})

test('worker preserves TokenWindowCapacity validation identity and owned message', async () => {
  await assert.rejects(
    executeLocalEmbedding(
      { ...request, texts: ['LOCAL_EMBEDDING_TOKEN_WINDOW_CAPACITY_INVALID'] },
      5000,
      undefined,
      workerUrl,
    ),
    (cause: unknown) => {
      assert.ok(cause instanceof LocalEmbeddingTokenWindowCapacityException)
      assert.equal(cause.code, 'LOCAL_EMBEDDING_TOKEN_WINDOW_CAPACITY_INVALID')
      assert.equal(cause.message, new LocalEmbeddingTokenWindowCapacityException().message)

      return true
    },
  )
})

test('worker preserves WindowVectors validation identity and owned message', async () => {
  await assert.rejects(
    executeLocalEmbedding(
      { ...request, texts: ['LOCAL_EMBEDDING_WINDOW_VECTORS_INVALID'] },
      5000,
      undefined,
      workerUrl,
    ),
    (cause: unknown) => {
      assert.ok(cause instanceof LocalEmbeddingWindowVectorsException)
      assert.equal(cause.code, 'LOCAL_EMBEDDING_WINDOW_VECTORS_INVALID')
      assert.equal(cause.message, new LocalEmbeddingWindowVectorsException().message)

      return true
    },
  )
})

test('worker preserves VectorMagnitude validation identity and owned message', async () => {
  await assert.rejects(
    executeLocalEmbedding(
      { ...request, texts: ['LOCAL_EMBEDDING_VECTOR_MAGNITUDE_INVALID'] },
      5000,
      undefined,
      workerUrl,
    ),
    (cause: unknown) => {
      assert.ok(cause instanceof LocalEmbeddingVectorMagnitudeException)
      assert.equal(cause.code, 'LOCAL_EMBEDDING_VECTOR_MAGNITUDE_INVALID')
      assert.equal(cause.message, new LocalEmbeddingVectorMagnitudeException().message)

      return true
    },
  )
})

test('worker preserves TokenizerUnsupported validation identity and owned message', async () => {
  await assert.rejects(
    executeLocalEmbedding({ ...request, texts: ['LOCAL_EMBEDDING_TOKENIZER_UNSUPPORTED'] }, 5000, undefined, workerUrl),
    (cause: unknown) => {
      assert.ok(cause instanceof LocalEmbeddingTokenizerUnsupportedException)
      assert.equal(cause.code, 'LOCAL_EMBEDDING_TOKENIZER_UNSUPPORTED')
      assert.equal(cause.message, new LocalEmbeddingTokenizerUnsupportedException().message)

      return true
    },
  )
})

test('worker preserves SpecialTokensUnsupported validation identity and owned message', async () => {
  await assert.rejects(
    executeLocalEmbedding(
      { ...request, texts: ['LOCAL_EMBEDDING_SPECIAL_TOKENS_UNSUPPORTED'] },
      5000,
      undefined,
      workerUrl,
    ),
    (cause: unknown) => {
      assert.ok(cause instanceof LocalEmbeddingSpecialTokensUnsupportedException)
      assert.equal(cause.code, 'LOCAL_EMBEDDING_SPECIAL_TOKENS_UNSUPPORTED')
      assert.equal(cause.message, new LocalEmbeddingSpecialTokensUnsupportedException().message)

      return true
    },
  )
})

test('worker startup failures preserve the external cause at the execution boundary', async () => {
  await assert.rejects(
    executeLocalEmbedding(request, 5000, undefined, new URL('https://invalid.example/worker.js')),
    (cause: unknown) => {
      assert.ok(cause instanceof LocalEmbeddingExecutionException)
      assert.equal(cause.code, 'LOCAL_EMBEDDING_EXECUTION_FAILED')
      assert.ok(cause.cause instanceof Error)

      return true
    },
  )
})
