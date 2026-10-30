import { ChunkDocumentIndexRequiredException } from '../../Domain/Exceptions/chunk-document-index-required.exception.ts'
import type { DocumentIndexingDeliveryDTO } from '../DataTransferObjects/document-indexing-delivery.dto.ts'
import type { MarkdownChunkPlan } from '../DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { ReplaceIndexChunkInputDTO } from '../DataTransferObjects/replace-index-chunk-input.dto.ts'
import { InvalidChunkReplacementTimestampException } from '../Exceptions/invalid-chunk-replacement-timestamp.exception.ts'

export class ProcessDocumentIndexAssembler {
  static toReplaceIndexChunkInputDTO(
    job: DocumentIndexingDeliveryDTO,
    markdownChunkPlan: MarkdownChunkPlan,
    chunkEmbeddings: readonly number[][],
    now: Date,
  ): ReplaceIndexChunkInputDTO {
    if (typeof job?.documentIndexId !== 'string' || !job.documentIndexId.trim())
      throw new ChunkDocumentIndexRequiredException()

    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new InvalidChunkReplacementTimestampException()

    return { job, markdownChunkPlan, chunkEmbeddings, now }
  }
}
