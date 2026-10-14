import assert from 'node:assert/strict'
import test from 'node:test'

import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { mapEmbeddingResponse } from '../../../src/Infrastructure/External/Embedding/Adapter/embedding-response.adapter.js'

test('embedding response restores provider indices to input order and discards upstream fields', () => {
  const response = {
    model: 'provider-model',
    data: [
      { index: 1, embedding: [0, 1], object: 'embedding' },
      { index: 0, embedding: [1, 0], object: 'embedding' },
    ],
  }

  assert.deepEqual(mapEmbeddingResponse(response, 2, 2), [
    [1, 0],
    [0, 1],
  ])
  assert.deepEqual(response.data[0]?.embedding, [0, 1])
})

test('embedding response accepts ordered vectors from providers without index fields', () => {
  assert.deepEqual(mapEmbeddingResponse({ data: [{ embedding: [0.25, -0.5] }] }, 1, 2), [[0.25, -0.5]])
})

test('embedding response rejects malformed payloads, incompatible vectors and ambiguous indices', () => {
  const invalidResponses: unknown[] = [
    null,
    [],
    {},
    { data: {} },
    { data: [] },
    { data: [null] },
    { data: Array<unknown>(1) },
    { data: [{ embedding: [1] }] },
    { data: [{ embedding: Array<unknown>(2) }] },
    { data: [{ embedding: [1, 'invalid'] }] },
    { data: [{ embedding: [Number.NaN, 0] }] },
    { data: [{ embedding: [Number.POSITIVE_INFINITY, 0] }] },
    { data: [{ index: '0', embedding: [1, 0] }] },
    { data: [{ index: -1, embedding: [1, 0] }] },
    { data: [{ index: 0.5, embedding: [1, 0] }] },
    { data: [{ index: 1, embedding: [1, 0] }] },
    { data: [{ embedding: [1, 0] }, { embedding: [0, 1] }] },
  ]
  invalidResponses.forEach((response) =>
    assert.throws(() => mapEmbeddingResponse(response, 1, 2), KnowledgeEmbeddingUnavailableException),
  )
  const ambiguousResponses = [
    {
      data: [
        { index: 0, embedding: [1, 0] },
        { index: 0, embedding: [0, 1] },
      ],
    },
    { data: [{ index: 0, embedding: [1, 0] }, { embedding: [0, 1] }] },
    {
      data: [
        { index: 0, embedding: [1, 0] },
        { index: 2, embedding: [0, 1] },
      ],
    },
  ]
  ambiguousResponses.forEach((response) =>
    assert.throws(() => mapEmbeddingResponse(response, 2, 2), KnowledgeEmbeddingUnavailableException),
  )
})
