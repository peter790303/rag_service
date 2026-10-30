import { LocalEmbeddingExecutionException } from '../Exceptions/local-embedding-execution.exception.ts'
import { LocalEmbeddingSpecialTokensUnsupportedException } from '../Exceptions/local-embedding-special-tokens-unsupported.exception.ts'
import { LocalEmbeddingTokenWindowCapacityException } from '../Exceptions/local-embedding-token-window-capacity.exception.ts'
import { LocalEmbeddingTokenizerUnsupportedException } from '../Exceptions/local-embedding-tokenizer-unsupported.exception.ts'
import { LocalEmbeddingVectorMagnitudeException } from '../Exceptions/local-embedding-vector-magnitude.exception.ts'
import { LocalEmbeddingWindowVectorsException } from '../Exceptions/local-embedding-window-vectors.exception.ts'

const validationExceptions = [
  LocalEmbeddingTokenWindowCapacityException,
  LocalEmbeddingWindowVectorsException,
  LocalEmbeddingVectorMagnitudeException,
  LocalEmbeddingTokenizerUnsupportedException,
  LocalEmbeddingSpecialTokensUnsupportedException,
]

export interface LocalEmbeddingWorkerFailure {
  failure: { code: string; diagnostic?: unknown }
}

/** Only owned validation identities cross the worker boundary as authored failures. */
export const serializeLocalEmbeddingFailure = (cause: unknown): LocalEmbeddingWorkerFailure => {
  const exceptionType = validationExceptions.find((candidate) => cause instanceof candidate)

  if (exceptionType) return { failure: { code: new exceptionType().code } }

  return {
    failure: {
      code: 'LOCAL_EMBEDDING_EXECUTION_FAILED',
      diagnostic: cause instanceof Error ? { name: cause.name, message: cause.message, stack: cause.stack } : cause,
    },
  }
}

export const readLocalEmbeddingWorkerResult = (message: unknown): unknown => {
  if (typeof message !== 'object' || message === null) throw new LocalEmbeddingExecutionException({ cause: message })

  if ('failure' in message) {
    const failure = message.failure

    if (typeof failure !== 'object' || failure === null || !('code' in failure))
      throw new LocalEmbeddingExecutionException({ cause: failure })

    const exceptionType = validationExceptions.find((candidate) => new candidate().code === failure.code)

    if (exceptionType) throw new exceptionType()

    throw new LocalEmbeddingExecutionException({
      cause: 'diagnostic' in failure ? failure.diagnostic : failure,
    })
  }

  if (!('vectors' in message)) throw new LocalEmbeddingExecutionException({ cause: message })

  return message.vectors
}
