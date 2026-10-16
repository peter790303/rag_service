import { ChunkDocumentIndexRequiredException } from '../../../Domain/Chunk/Exceptions/chunk-document-index-required.exception.ts'
import type { MarkdownChunkPlan } from '../../Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { ReplaceIndexChunkInputDto } from '../../Chunks/DataTransferObjects/replace-index-chunk-input.dto.ts'
import { InvalidChunkReplacementTimestampException } from '../../Chunks/Exceptions/invalid-chunk-replacement-timestamp.exception.ts'
import type { DocumentIndexingDeliveryDto } from '../DataTransferObjects/document-indexing-delivery.dto.ts'

export class ProcessDocumentIndexAssembler {
  static toReplaceIndexChunkInputDTO(
    job: DocumentIndexingDeliveryDto,
    markdownChunkPlan: MarkdownChunkPlan,
    chunkEmbeddings: readonly number[][],
    now: Date,
  ): ReplaceIndexChunkInputDto {
    if (typeof job?.documentIndexId !== 'string' || !job.documentIndexId.trim())
      throw new ChunkDocumentIndexRequiredException()

    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new InvalidChunkReplacementTimestampException()

    return { job, markdownChunkPlan, chunkEmbeddings, now }
  }
}
