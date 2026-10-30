import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'

import { AutoModel, BertTokenizer, env, mean_pooling, Tensor } from '@huggingface/transformers'
import { concatMap, from, lastValueFrom, toArray } from 'rxjs'

import { createTokenWindows, poolWindowVectors } from './Adapters/local-embedding-vector.adapter.ts'
import { serializeLocalEmbeddingFailure } from './Adapters/local-embedding-worker-protocol.adapter.ts'
import { LocalEmbeddingSpecialTokensUnsupportedException } from './Exceptions/local-embedding-special-tokens-unsupported.exception.ts'
import { LocalEmbeddingTokenizerUnsupportedException } from './Exceptions/local-embedding-tokenizer-unsupported.exception.ts'
import type { LocalEmbeddingRequest } from './local-embedding-execution.ts'

const run = async (request: LocalEmbeddingRequest): Promise<number[][]> => {
  env.allowRemoteModels = false
  const modelDirectory = join(request.cacheDir, request.model, request.revision)
  const [tokenizerJson, tokenizerConfigJson] = await Promise.all([
    readFile(join(modelDirectory, 'tokenizer.json'), 'utf8'),
    readFile(join(modelDirectory, 'tokenizer_config.json'), 'utf8'),
  ])
  const tokenizerConfig = JSON.parse(tokenizerConfigJson) as Record<string, unknown>

  if (tokenizerConfig.tokenizer_class !== 'BertTokenizer') throw new LocalEmbeddingTokenizerUnsupportedException()

  const tokenizer = new BertTokenizer(JSON.parse(tokenizerJson), tokenizerConfig)
  const model = await AutoModel.from_pretrained(request.model, {
    revision: request.revision,
    cache_dir: request.cacheDir,
    local_files_only: true,
    device: 'cpu',
    dtype: 'q8',
  })
  try {
    const emptyTokens = tokenizer.encode('')

    if (emptyTokens.length !== 2) throw new LocalEmbeddingSpecialTokensUnsupportedException()

    const capacity =
      Math.min(Number(tokenizer.model_max_length), Number(model.config.max_position_embeddings)) - emptyTokens.length

    return await lastValueFrom(
      from(request.texts).pipe(
        concatMap(async (text) => {
          // Tokenize once without truncation; every content token belongs to exactly one bounded window.
          const windows = createTokenWindows(tokenizer.encode(text, { add_special_tokens: false }), capacity)
          const vectors = await lastValueFrom(
            from(windows).pipe(
              concatMap(async (tokens) => {
                const inputIds = [emptyTokens[0]!, ...tokens, emptyTokens[1]!]
                const attentionMask = new Tensor(
                  'int64',
                  BigInt64Array.from(inputIds, () => 1n),
                  [1, inputIds.length],
                )
                const output = await model({
                  input_ids: new Tensor('int64', BigInt64Array.from(inputIds, BigInt), [1, inputIds.length]),
                  attention_mask: attentionMask,
                  token_type_ids: new Tensor('int64', new BigInt64Array(inputIds.length), [1, inputIds.length]),
                })
                const vector = Array.from(mean_pooling(output.last_hidden_state as Tensor, attentionMask).data, Number)

                return { vector: poolWindowVectors([{ vector, weight: 1 }]), weight: Math.max(1, tokens.length) }
              }),
              toArray(),
            ),
          )

          return poolWindowVectors(vectors)
        }),
        toArray(),
      ),
    )
  } finally {
    await model.dispose()
  }
}

void run(workerData as LocalEmbeddingRequest).then(
  (vectors) => parentPort?.postMessage({ vectors }),
  (cause: unknown) => parentPort?.postMessage(serializeLocalEmbeddingFailure(cause)),
)
