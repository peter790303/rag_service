import type { MarkdownChunkPlan } from './markdown-chunk-plan.dto.ts'
import type { DocumentIndexingDeliveryDto } from '../../DocumentIndexes/DataTransferObjects/document-indexing-delivery.dto.ts'

export interface ReplaceIndexChunkInputDto {
  job: DocumentIndexingDeliveryDto
  markdownChunkPlan: MarkdownChunkPlan
  chunkEmbeddings: readonly number[][]
  now: Date
}
