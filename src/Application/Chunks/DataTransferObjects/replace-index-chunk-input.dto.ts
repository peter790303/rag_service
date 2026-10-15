import type { MarkdownChunkPlan } from './markdown-chunk-plan.dto.ts'
import type { IndexJobDeliveryDto } from '../../DocumentIndexes/DataTransferObjects/index-job-delivery.dto.ts'

export interface ReplaceIndexChunkInputDto {
  indexJob: IndexJobDeliveryDto
  markdownChunkPlan: MarkdownChunkPlan
  chunkEmbeddings: readonly number[][]
  lexicalSearchTexts: readonly string[]
  now: Date
}
