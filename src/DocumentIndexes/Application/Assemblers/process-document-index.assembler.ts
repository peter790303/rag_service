import type { ReplaceIndexChunkCommand } from '../../../Chunks/Application/Commands/replace-index-chunk.command.ts'
import type { MarkdownChunkPlan } from '../../../Chunks/Application/DataTransferObjects/markdown-chunk-plan.dto.ts'
import { InvalidChunkReplacementTimestampException } from '../../../Chunks/Application/Exceptions/invalid-chunk-replacement-timestamp.exception.ts'
import { ChunkDocumentIndexRequiredException } from '../../../Chunks/Domain/Exceptions/chunk-document-index-required.exception.ts'
import type { DocumentIndexingDeliveryDTO } from '../DataTransferObjects/document-indexing-delivery.dto.ts'

export class ProcessDocumentIndexAssembler {
  static toReplaceIndexChunkCommand(
    job: DocumentIndexingDeliveryDTO,
    markdownChunkPlan: MarkdownChunkPlan,
    chunkEmbeddings: readonly number[][],
    now: Date,
  ): ReplaceIndexChunkCommand {
    if (typeof job?.documentIndexId !== 'string' || !job.documentIndexId.trim())
      throw new ChunkDocumentIndexRequiredException()

    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new InvalidChunkReplacementTimestampException()

    return {
      job: {
        id: job.id,
        knowledgeBaseId: job.knowledgeBaseId,
        documentId: job.documentId,
        documentIndexId: job.documentIndexId,
        generation: job.generation,
        attempts: job.attempts,
        leaseToken: job.leaseToken,
        leaseExpiresAt: job.leaseExpiresAt,
      },
      markdownChunkPlan,
      chunkEmbeddings,
      now,
    }
  }
}
