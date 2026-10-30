import type { MarkdownChunkPlan } from './markdown-chunk-plan.dto.ts'
import type { DocumentIndexingDeliveryDTO } from '../../../DocumentIndexes/Application/DataTransferObjects/document-indexing-delivery.dto.ts'

export interface ReplaceIndexChunkInputDTO {
  job: DocumentIndexingDeliveryDTO
  markdownChunkPlan: MarkdownChunkPlan
  chunkEmbeddings: readonly number[][]
  now: Date
}
