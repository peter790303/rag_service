import { parentPort, workerData } from 'node:worker_threads'

import { serializeLocalEmbeddingFailure } from '../../src/Shared/Infrastructure/External/Embedding/Adapters/local-embedding-worker-protocol.adapter.ts'
import { LocalEmbeddingSpecialTokensUnsupportedException } from '../../src/Shared/Infrastructure/External/Embedding/Exceptions/local-embedding-special-tokens-unsupported.exception.ts'
import { LocalEmbeddingTokenWindowCapacityException } from '../../src/Shared/Infrastructure/External/Embedding/Exceptions/local-embedding-token-window-capacity.exception.ts'
import { LocalEmbeddingTokenizerUnsupportedException } from '../../src/Shared/Infrastructure/External/Embedding/Exceptions/local-embedding-tokenizer-unsupported.exception.ts'
import { LocalEmbeddingVectorMagnitudeException } from '../../src/Shared/Infrastructure/External/Embedding/Exceptions/local-embedding-vector-magnitude.exception.ts'
import { LocalEmbeddingWindowVectorsException } from '../../src/Shared/Infrastructure/External/Embedding/Exceptions/local-embedding-window-vectors.exception.ts'

const request = workerData as { texts: string[] }
const validationExceptions = [
  LocalEmbeddingTokenWindowCapacityException,
  LocalEmbeddingWindowVectorsException,
  LocalEmbeddingVectorMagnitudeException,
  LocalEmbeddingTokenizerUnsupportedException,
  LocalEmbeddingSpecialTokensUnsupportedException,
]
const exceptionType = validationExceptions.find((candidate) => new candidate().code === request.texts[0])

if (request.texts[0] === 'stall') setInterval(() => {}, 1000)
else if (request.texts[0] === 'exit') process.exit(1)
else if (request.texts[0] === 'failure')
  parentPort?.postMessage(serializeLocalEmbeddingFailure(new TypeError('Inference failed')))
else if (request.texts[0] === 'crash') throw new TypeError('Native worker crashed')
else if (exceptionType) parentPort?.postMessage(serializeLocalEmbeddingFailure(new exceptionType()))
else parentPort?.postMessage({ vectors: [[1, 0]] })
