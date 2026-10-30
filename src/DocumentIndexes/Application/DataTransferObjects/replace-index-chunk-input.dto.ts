import type { DocumentIndexingDeliveryDTO } from './document-indexing-delivery.dto.ts'
import type { MarkdownChunkPlan } from './markdown-chunk-plan.dto.ts'

export interface ReplaceIndexChunkInputDTO {
  job: DocumentIndexingDeliveryDTO
  markdownChunkPlan: MarkdownChunkPlan
  chunkEmbeddings: readonly number[][]
  now: Date
}
