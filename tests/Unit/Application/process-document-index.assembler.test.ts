import assert from 'node:assert/strict'
import test from 'node:test'

import { ProcessDocumentIndexAssembler } from '../../../src/DocumentIndexes/Application/Assemblers/process-document-index.assembler.ts'
import type { DocumentIndexingDeliveryDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-indexing-delivery.dto.ts'
import type { MarkdownChunkPlan } from '../../../src/DocumentIndexes/Application/DataTransferObjects/markdown-chunk-plan.dto.ts'
import { InvalidChunkReplacementTimestampException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-chunk-replacement-timestamp.exception.ts'
import { ChunkDocumentIndexRequiredException } from '../../../src/DocumentIndexes/Domain/Exceptions/chunk-document-index-required.exception.ts'

const emptyPlan: MarkdownChunkPlan = { chunks: [], relations: [] }
const now = new Date('2026-10-16T00:00:00.000Z')
const jobDelivery: DocumentIndexingDeliveryDTO = {
  id: 'job',
  knowledgeBaseId: 'knowledge-base',
  documentId: 'document',
  documentIndexId: 'index',
  generation: '1',
  attempts: 1,
  leaseToken: 'lease',
  leaseExpiresAt: new Date('2026-10-16T01:00:00.000Z'),
}

test('replacement DTO conversion rejects missing or malformed index IDs even for an empty plan', () => {
  const invalidIndexIds = [undefined, null, 42, '', ' ']
  invalidIndexIds.forEach((documentIndexId) => {
    const job = { ...jobDelivery, documentIndexId } as unknown as DocumentIndexingDeliveryDTO
    assert.throws(
      () => ProcessDocumentIndexAssembler.toReplaceIndexChunkInputDTO(job, emptyPlan, [], now),
      ChunkDocumentIndexRequiredException,
    )
  })
  const missingJobs = [undefined, null]
  missingJobs.forEach((job) => {
    assert.throws(
      () =>
        ProcessDocumentIndexAssembler.toReplaceIndexChunkInputDTO(
          job as unknown as DocumentIndexingDeliveryDTO,
          emptyPlan,
          [],
          now,
        ),
      ChunkDocumentIndexRequiredException,
    )
  })
})

test('replacement DTO conversion rejects missing, mistyped and invalid timestamps', () => {
  const invalidTimestamps = [undefined, null, '2026-10-16', 0, new Date(NaN)]
  invalidTimestamps.forEach((timestamp) => {
    assert.throws(
      () =>
        ProcessDocumentIndexAssembler.toReplaceIndexChunkInputDTO(
          jobDelivery,
          emptyPlan,
          [],
          timestamp as unknown as Date,
        ),
      InvalidChunkReplacementTimestampException,
    )
  })
})

test('replacement DTO conversion preserves delivery, plan, vectors and timestamp without I/O', () => {
  const job = Object.freeze(jobDelivery)
  const plan = Object.freeze(emptyPlan)
  const vectors = Object.freeze([])

  assert.deepEqual(ProcessDocumentIndexAssembler.toReplaceIndexChunkInputDTO(job, plan, vectors, now), {
    job,
    markdownChunkPlan: plan,
    chunkEmbeddings: vectors,
    now,
  })
})
